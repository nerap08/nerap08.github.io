// ── Google Sign-In config ──────────────────────────────────────────────
// 1. Go to https://console.cloud.google.com/apis/credentials
// 2. Create an OAuth client ID > Application type: Web application
// 3. Under "Authorized JavaScript origins" add your real domain,
//    e.g. https://paultrusov.me (and http://localhost:PORT if testing locally
//    with a local server — this will NOT work opening the file directly
//    via file://, it has to be served over http/https).
// 4. Paste the generated client ID below.
var GOOGLE_CLIENT_ID = '1088973367844-7tkqlgk1n86lfb5mj3psn3u1bl66foj0.apps.googleusercontent.com';
var AUTHORIZED_EMAIL = 'paulmtrusov@gmail.com';

function parseJwt(token) {
  var base64Url = token.split('.')[1];
  var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  var json = decodeURIComponent(
    atob(base64)
      .split('')
      .map(function (c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); })
      .join('')
  );
  return JSON.parse(json);
}

function showAuthMessage(text) {
  var el = document.getElementById('auth-message');
  if (!el) return;
  el.textContent = text;
  el.classList.add('auth-message-show');
  setTimeout(function () { el.classList.remove('auth-message-show'); }, 2800);
}

function handleCredentialResponse(response) {
  var payload;
  try {
    payload = parseJwt(response.credential);
  } catch (err) {
    showAuthMessage('Sign-in failed.');
    return;
  }
  if (payload.email === AUTHORIZED_EMAIL && payload.email_verified) {
    sessionStorage.setItem('editUnlocked', '1');
    document.body.classList.add('edit-unlocked');
    showAuthMessage('Signed in as ' + payload.email);
  } else {
    showAuthMessage('Wrong Google account. Not signing in.');
  }
}

if (sessionStorage.getItem('editUnlocked') === '1') {
  document.body.classList.add('edit-unlocked');
}

window.addEventListener('load', function () {
  if (!window.google || GOOGLE_CLIENT_ID.indexOf('YOUR_CLIENT_ID') === 0) return;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse
  });
});

var trigger = document.querySelector('[data-secret-trigger]');
if (trigger) {
  trigger.addEventListener('click', function () {
    if (document.body.classList.contains('edit-unlocked')) return;
    if (!window.google || GOOGLE_CLIENT_ID.indexOf('YOUR_CLIENT_ID') === 0) {
      showAuthMessage('Google sign-in isn\'t configured yet.');
      return;
    }
    google.accounts.id.prompt();
  });
}

// ── Posts feed + composer ──────────────────────────────────────────────

// Only a small whitelist of tags survives from the composer into a saved
// post — keeps localStorage-rendered HTML from being an arbitrary XSS sink.
function sanitizeComposerHtml(html) {
  var ALLOWED_TAGS = { A: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, DIV: 1, P: 1, SPAN: 1 };
  var container = document.createElement('div');
  container.innerHTML = html;

  (function clean(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 1) {
        clean(child);
        if (!ALLOWED_TAGS[child.tagName]) {
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
          return;
        }
        var pendingHref = child.tagName === 'A' ? (child.getAttribute('data-href') || '').trim() : '';
        Array.prototype.slice.call(child.attributes).forEach(function (attr) {
          child.removeAttribute(attr.name);
        });
        if (child.tagName === 'A' && /^https?:\/\//i.test(pendingHref)) {
          child.setAttribute('href', pendingHref);
          child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noopener noreferrer');
        }
      } else if (child.nodeType !== 3) {
        node.removeChild(child);
      }
    });
  })(container);

  return container.innerHTML;
}

function deletePostFromStorage(id) {
  var saved = JSON.parse(localStorage.getItem('paulPosts') || '[]');
  saved = saved.filter(function (p) { return p.id !== id; });
  localStorage.setItem('paulPosts', JSON.stringify(saved));
}

function wireDeleteButton(btn, card) {
  btn.addEventListener('click', function () {
    var id = card.getAttribute('data-id');
    if (id) deletePostFromStorage(id);
    card.remove();
  });
}

function addPostCard(html, images, id) {
  var scroll = document.querySelector('.posts-scroll');
  if (!scroll) return;

  var card = document.createElement('div');
  card.className = 'post-card';
  card.setAttribute('data-id', id);

  var head = document.createElement('div');
  head.className = 'post-head';

  var avatar = document.createElement('div');
  avatar.className = 'post-avatar';

  var name = document.createElement('p');
  name.className = 'post-name';
  name.textContent = 'Paul Trusov';

  var deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'post-delete';
  deleteBtn.setAttribute('aria-label', 'Delete post');
  deleteBtn.innerHTML = '&times;';
  wireDeleteButton(deleteBtn, card);

  head.appendChild(avatar);
  head.appendChild(name);
  head.appendChild(deleteBtn);
  card.appendChild(head);

  if (html) {
    var body = document.createElement('p');
    body.className = 'post-text';
    body.innerHTML = html;
    card.appendChild(body);
  }

  if (images && images.length) {
    var imagesWrap = document.createElement('div');
    imagesWrap.className = 'post-images';
    images.forEach(function (src) {
      var img = document.createElement('img');
      img.src = src;
      imagesWrap.appendChild(img);
    });
    card.appendChild(imagesWrap);
  }

  scroll.insertBefore(card, scroll.firstChild);
}

function loadSavedPosts() {
  var saved = JSON.parse(localStorage.getItem('paulPosts') || '[]');
  saved.forEach(function (p) { addPostCard(p.html, p.images, p.id); });
}

function savePost(html, images, id) {
  var saved = JSON.parse(localStorage.getItem('paulPosts') || '[]');
  saved.unshift({ id: id, html: html, images: images });
  localStorage.setItem('paulPosts', JSON.stringify(saved));
}

loadSavedPosts();

var openComposerBtn = document.getElementById('open-composer');
var composer = document.getElementById('post-composer');
var composerClose = document.getElementById('composer-close');
var composerText = document.getElementById('composer-text');
var composerLinkBtn = document.getElementById('composer-link-btn');
var composerImageInput = document.getElementById('composer-image-input');
var composerImagePreview = document.getElementById('composer-image-preview');
var composerSubmit = document.getElementById('composer-submit');
var pendingImages = [];

function resetComposer() {
  composerText.innerHTML = '';
  pendingImages = [];
  composerImagePreview.innerHTML = '';
}

function renderImagePreview() {
  composerImagePreview.innerHTML = '';
  pendingImages.forEach(function (src, i) {
    var thumb = document.createElement('div');
    thumb.className = 'composer-image-thumb';

    var img = document.createElement('img');
    img.src = src;

    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'composer-image-remove';
    remove.innerHTML = '&times;';
    remove.addEventListener('click', function () {
      pendingImages.splice(i, 1);
      renderImagePreview();
    });

    thumb.appendChild(img);
    thumb.appendChild(remove);
    composerImagePreview.appendChild(thumb);
  });
}

if (openComposerBtn && composer) {
  openComposerBtn.addEventListener('click', function () {
    composer.classList.add('modal-open');
    composerText.focus();
  });

  composerClose.addEventListener('click', function () {
    composer.classList.remove('modal-open');
  });

  composer.addEventListener('click', function (e) {
    if (e.target === composer) composer.classList.remove('modal-open');
  });

  // Contenteditable leaves a stray <br> behind after the last character is
  // deleted, which defeats the :empty CSS placeholder — clear it out.
  composerText.addEventListener('input', function () {
    if (composerText.innerHTML === '<br>') composerText.innerHTML = '';
  });

  if (composerLinkBtn) {
    composerLinkBtn.addEventListener('click', function () {
      var selection = window.getSelection();
      if (!selection || selection.isCollapsed || !composerText.contains(selection.anchorNode)) {
        showAuthMessage('Select some text in the post first, then click the link icon.');
        return;
      }
      var url = window.prompt('Link URL:');
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      document.execCommand('createLink', false, '#');
      var node = window.getSelection().anchorNode;
      var a = node && (node.nodeType === 1 ? node.closest('a') : node.parentElement && node.parentElement.closest('a'));
      if (a) a.setAttribute('data-href', url);
    });
  }

  composerImageInput.addEventListener('change', function () {
    Array.prototype.forEach.call(composerImageInput.files, function (file) {
      var reader = new FileReader();
      reader.onload = function (e) {
        pendingImages.push(e.target.result);
        renderImagePreview();
      };
      reader.readAsDataURL(file);
    });
    composerImageInput.value = '';
  });

  composerSubmit.addEventListener('click', function () {
    var html = sanitizeComposerHtml(composerText.innerHTML);
    var hasText = composerText.textContent.trim().length > 0;
    if (!hasText && pendingImages.length === 0) return;
    var id = Date.now().toString();
    addPostCard(html, pendingImages, id);
    savePost(html, pendingImages, id);
    composer.classList.remove('modal-open');
    resetComposer();
  });
}

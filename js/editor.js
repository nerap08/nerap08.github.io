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
    showAuthMessage('This isn\'t ' + AUTHORIZED_EMAIL + ' — not unlocking.');
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
function formatPostDate(d) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function deletePostFromStorage(id) {
  var saved = JSON.parse(localStorage.getItem('paulPosts') || '[]');
  saved = saved.filter(function (p) { return p.id !== id; });
  localStorage.setItem('paulPosts', JSON.stringify(saved));
}

function wireDeleteButton(btn, card) {
  btn.addEventListener('click', function () {
    var id = card.getAttribute('data-id');
    if (id && id !== 'placeholder') deletePostFromStorage(id);
    card.remove();
  });
}

function addPostCard(text, dateStr, images, id) {
  var scroll = document.querySelector('.posts-scroll');
  if (!scroll) return;

  var card = document.createElement('div');
  card.className = 'post-card';
  card.setAttribute('data-id', id);

  var head = document.createElement('div');
  head.className = 'post-head';

  var avatar = document.createElement('div');
  avatar.className = 'post-avatar';

  var nameWrap = document.createElement('div');
  var name = document.createElement('p');
  name.className = 'post-name';
  name.textContent = 'Paul Trusov';
  var date = document.createElement('p');
  date.className = 'post-date';
  date.textContent = dateStr;
  nameWrap.appendChild(name);
  nameWrap.appendChild(date);

  var deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'post-delete';
  deleteBtn.setAttribute('aria-label', 'Delete post');
  deleteBtn.innerHTML = '&times;';
  wireDeleteButton(deleteBtn, card);

  head.appendChild(avatar);
  head.appendChild(nameWrap);
  head.appendChild(deleteBtn);
  card.appendChild(head);

  if (text) {
    var body = document.createElement('p');
    body.className = 'post-text';
    body.textContent = text;
    card.appendChild(body);
  }

  (images || []).forEach(function (src) {
    var img = document.createElement('img');
    img.src = src;
    img.style.width = '100%';
    img.style.borderRadius = '6px';
    img.style.marginTop = '10px';
    card.appendChild(img);
  });

  scroll.insertBefore(card, scroll.firstChild);
}

function loadSavedPosts() {
  var saved = JSON.parse(localStorage.getItem('paulPosts') || '[]');
  saved.forEach(function (p) { addPostCard(p.text, p.date, p.images, p.id); });
}

function savePost(text, dateStr, images, id) {
  var saved = JSON.parse(localStorage.getItem('paulPosts') || '[]');
  saved.unshift({ id: id, text: text, date: dateStr, images: images });
  localStorage.setItem('paulPosts', JSON.stringify(saved));
}

loadSavedPosts();

document.querySelectorAll('.post-card[data-id] .post-delete').forEach(function (btn) {
  var card = btn.closest('.post-card');
  if (card.getAttribute('data-id') === 'placeholder') wireDeleteButton(btn, card);
});

var openComposerBtn = document.getElementById('open-composer');
var composer = document.getElementById('post-composer');
var composerClose = document.getElementById('composer-close');
var composerText = document.getElementById('composer-text');
var composerCounter = document.getElementById('composer-counter');
var composerImageInput = document.getElementById('composer-image-input');
var composerImagePreview = document.getElementById('composer-image-preview');
var composerSubmit = document.getElementById('composer-submit');
var pendingImages = [];

function resetComposer() {
  composerText.value = '';
  composerCounter.textContent = '0/3000';
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

  composerText.addEventListener('input', function () {
    composerCounter.textContent = composerText.value.length + '/3000';
  });

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
    var text = composerText.value.trim();
    if (!text && pendingImages.length === 0) return;
    var dateStr = formatPostDate(new Date());
    var id = Date.now().toString();
    addPostCard(text, dateStr, pendingImages, id);
    savePost(text, dateStr, pendingImages, id);
    composer.classList.remove('modal-open');
    resetComposer();
  });
}

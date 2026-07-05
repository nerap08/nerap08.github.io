// ── Firebase config ─────────────────────────────────────────────────────
// 1. Go to https://console.firebase.google.com and create a project.
// 2. Build > Firestore Database > Create database (production mode, any
//    region close to you).
// 3. Build > Authentication > Sign-in method > enable the Google provider.
// 4. Project settings (gear icon, top left) > General > "Your apps" >
//    click the </> (web) icon to register a web app.
// 5. Paste the firebaseConfig object it gives you in place of the one below.
// 6. In Firestore > Rules, paste the rules from the comment at the bottom
//    of this file so only paulmtrusov@gmail.com can write posts.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

var firebaseConfig = {
  apiKey: 'AIzaSyDZjIVYPw8zCaIIrpJFLQYk41PGJ-lj5EE',
  authDomain: 'paultrusov-me.firebaseapp.com',
  projectId: 'paultrusov-me',
  storageBucket: 'paultrusov-me.firebasestorage.app',
  messagingSenderId: '584740098577',
  appId: '1:584740098577:web:eca5edf67ac9a80be197b0'
};
var AUTHORIZED_EMAIL = 'paulmtrusov@gmail.com';
var FIREBASE_CONFIGURED = firebaseConfig.apiKey.indexOf('YOUR_') !== 0;

var app, auth, db;
if (FIREBASE_CONFIGURED) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

function showAuthMessage(text) {
  var el = document.getElementById('auth-message');
  if (!el) return;
  el.textContent = text;
  el.classList.add('auth-message-show');
  setTimeout(function () { el.classList.remove('auth-message-show'); }, 2800);
}

// One-time upload of posts that were only ever saved to this browser's
// localStorage, back from before Firestore was wired in.
function migrateLocalPosts() {
  if (localStorage.getItem('paulPostsMigrated')) return;
  var saved = JSON.parse(localStorage.getItem('paulPosts') || '[]');
  if (!saved.length) {
    localStorage.setItem('paulPostsMigrated', '1');
    return;
  }
  var oldestFirst = saved.slice().reverse();
  var chain = Promise.resolve();
  oldestFirst.forEach(function (p) {
    var html = p.html;
    if (!html && p.text) {
      var tmp = document.createElement('div');
      tmp.textContent = p.text;
      html = tmp.innerHTML;
    }
    chain = chain.then(function () {
      return addDoc(collection(db, 'posts'), {
        html: html || '',
        images: p.images || [],
        createdAt: serverTimestamp()
      });
    });
  });
  chain.then(function () {
    localStorage.setItem('paulPostsMigrated', '1');
    showAuthMessage('Old posts migrated to the new database.');
  }).catch(function (err) {
    showAuthMessage('Migration failed: ' + err.message);
  });
}

if (FIREBASE_CONFIGURED) {
  onAuthStateChanged(auth, function (user) {
    if (user && user.email === AUTHORIZED_EMAIL && user.emailVerified) {
      document.body.classList.add('edit-unlocked');
      migrateLocalPosts();
    } else {
      document.body.classList.remove('edit-unlocked');
      if (user) {
        showAuthMessage('Wrong Google account. Not signing in.');
        signOut(auth);
      }
    }
  });
}

var trigger = document.querySelector('[data-secret-trigger]');
if (trigger) {
  trigger.addEventListener('click', function () {
    if (document.body.classList.contains('edit-unlocked')) return;
    if (!FIREBASE_CONFIGURED) {
      showAuthMessage('Firebase isn\'t configured yet.');
      return;
    }
    signInWithPopup(auth, new GoogleAuthProvider()).catch(function () {
      showAuthMessage('Sign-in failed.');
    });
  });
}

var signOutTrigger = document.querySelector('[data-sign-out]');
if (signOutTrigger) {
  signOutTrigger.addEventListener('click', function () {
    if (FIREBASE_CONFIGURED) signOut(auth);
  });
}

// ── Posts feed + composer ──────────────────────────────────────────────

// Only a small whitelist of tags survives from the composer into a saved
// post — write access is already locked to one account via Firestore
// security rules, this is just defense in depth on top of that.
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

// Downscale + recompress client-side so a handful of photos comfortably
// fits Firestore's 1MiB-per-document limit.
function resizeImageFile(file, maxWidth, quality) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = reject;
    reader.onload = function (e) {
      var img = new Image();
      img.onerror = reject;
      img.onload = function () {
        var scale = Math.min(1, maxWidth / img.width);
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function wireDeleteButton(btn, id) {
  btn.addEventListener('click', function () {
    if (!FIREBASE_CONFIGURED) return;
    deleteDoc(doc(db, 'posts', id)).catch(function (err) {
      showAuthMessage('Delete failed: ' + err.message);
    });
  });
}

function buildPostCard(postData) {
  var card = document.createElement('div');
  card.className = 'post-card';
  card.setAttribute('data-id', postData.id);

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
  wireDeleteButton(deleteBtn, postData.id);

  head.appendChild(avatar);
  head.appendChild(name);
  head.appendChild(deleteBtn);
  card.appendChild(head);

  if (postData.html) {
    var body = document.createElement('p');
    body.className = 'post-text';
    body.innerHTML = postData.html;
    card.appendChild(body);
  }

  var images = postData.images || [];
  if (images.length) {
    var imagesWrap = document.createElement('div');
    imagesWrap.className = 'post-images';

    var slide = document.createElement('img');
    slide.className = 'post-image-slide';
    slide.src = images[0];
    imagesWrap.appendChild(slide);

    if (images.length > 1) {
      var index = 0;
      var prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'post-image-arrow post-image-prev';
      prevBtn.setAttribute('aria-label', 'Previous image');
      prevBtn.innerHTML = '&#8249;';
      prevBtn.addEventListener('click', function () {
        index = (index - 1 + images.length) % images.length;
        slide.src = images[index];
      });

      var nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'post-image-arrow post-image-next';
      nextBtn.setAttribute('aria-label', 'Next image');
      nextBtn.innerHTML = '&#8250;';
      nextBtn.addEventListener('click', function () {
        index = (index + 1) % images.length;
        slide.src = images[index];
      });

      imagesWrap.appendChild(prevBtn);
      imagesWrap.appendChild(nextBtn);
    }

    card.appendChild(imagesWrap);
  }

  return card;
}

if (FIREBASE_CONFIGURED) {
  var postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
  onSnapshot(postsQuery, function (snapshot) {
    var scroll = document.querySelector('.posts-scroll');
    if (!scroll) return;
    scroll.innerHTML = '';
    snapshot.forEach(function (docSnap) {
      var data = docSnap.data();
      data.id = docSnap.id;
      scroll.appendChild(buildPostCard(data));
    });
  }, function (err) {
    showAuthMessage('Could not load posts: ' + err.message);
  });
}

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
    var files = Array.prototype.slice.call(composerImageInput.files);
    Promise.all(files.map(function (file) { return resizeImageFile(file, 1280, 0.75); }))
      .then(function (dataUrls) {
        dataUrls.forEach(function (src) { pendingImages.push(src); });
        renderImagePreview();
      })
      .catch(function () {
        showAuthMessage('Could not process one of those images.');
      });
    composerImageInput.value = '';
  });

  composerSubmit.addEventListener('click', function () {
    if (!FIREBASE_CONFIGURED) {
      showAuthMessage('Firebase isn\'t configured yet.');
      return;
    }
    var html = sanitizeComposerHtml(composerText.innerHTML);
    var hasText = composerText.textContent.trim().length > 0;
    if (!hasText && pendingImages.length === 0) return;
    addDoc(collection(db, 'posts'), {
      html: html,
      images: pendingImages,
      createdAt: serverTimestamp()
    }).then(function () {
      composer.classList.remove('modal-open');
      resetComposer();
    }).catch(function (err) {
      showAuthMessage('Post failed: ' + err.message);
    });
  });
}

// ── Firestore security rules ────────────────────────────────────────────
// Paste this into the Firebase console: Firestore Database > Rules.
//
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     match /posts/{postId} {
//       allow read: if true;
//       allow create: if request.auth != null
//                     && request.auth.token.email == 'paulmtrusov@gmail.com'
//                     && request.auth.token.email_verified == true;
//       allow delete: if request.auth != null
//                     && request.auth.token.email == 'paulmtrusov@gmail.com'
//                     && request.auth.token.email_verified == true;
//       allow update: if false;
//     }
//   }
// }

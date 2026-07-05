document.querySelectorAll('.gallery-close').forEach(function (btn) {
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    var gallery = btn.closest('.project-gallery');
    gallery.classList.add('gallery-closed');
  });
});

document.querySelectorAll('.project-gallery').forEach(function (gallery) {
  gallery.addEventListener('mouseleave', function () {
    gallery.classList.remove('gallery-closed');
  });
});

document.querySelectorAll('.gallery-overlay').forEach(function (overlay) {
  overlay.addEventListener('click', function (e) {
    if (!e.target.closest('.gallery-overlay-thumb') && !e.target.closest('.gallery-close')) {
      var gallery = overlay.closest('.project-gallery');
      gallery.classList.add('gallery-closed');
    }
  });
});

document.querySelectorAll('[data-lightbox]').forEach(function (trigger) {
  trigger.addEventListener('click', function (e) {
    e.preventDefault();
    var target = document.getElementById(trigger.getAttribute('data-lightbox'));
    if (target) target.classList.add('lightbox-open');
  });
});

document.querySelectorAll('.lightbox').forEach(function (lightbox) {
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox || e.target.closest('.gallery-close')) {
      lightbox.classList.remove('lightbox-open');
    }
  });
});

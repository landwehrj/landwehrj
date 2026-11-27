const memorialPhotoDescriptions = [
    'Curled up on a plaid blanket', 'Sleeping on a patterned pillow', 'Curled up on the white bedding',
    'As a kitten, cleaning her paw', 'Cleaning herself as a kitten', 'Stretched out beside the monitor',
    'Keeping watch by the glowing monitor', 'Nestled on a towel at the desk', 'Resting behind my head on the chair',
    'Standing behind my shoulders', 'Balancing across my shoulders', 'At the keyboard in front of the monitor',
    'Asleep in her bed beside the desk', 'Curled up on her cat tower', 'Curled up on the computer chair',
    'Looking up from the chair cushion', 'Asleep across the chair, one paw hanging down'
  ];
const memorialPhotoMemories = new Map(
  Array.from(document.querySelectorAll('#poems [data-memory-photo]'), verse => [Number(verse.dataset.memoryPhoto), verse])
);
(() => {
  const viewer = document.querySelector('#viewer');
  const gallery = document.querySelector('#gallery');
  const poems = document.querySelector('#poems');
  const photo = document.querySelector('#photo');
  const memory = document.querySelector('#photo-memory');
  const kitten = [4, 5, 6], work = [7, 8, 9, 10, 11, 12, 13, 14], chair = [17, 15, 16];
  const chapters = {
    all: ['Photo album', [...kitten, ...work, 15, 16, 17, 1, 2, 3]],
    kitten: ['Early days', kitten],
    work: ['Keeping watch', work],
    chair: ['The warm chair', chair],
    monitor: ['At the computer', [...kitten, ...work]]
  };
  let slides = [], position = 0;
  function showPhoto() {
    const id = slides[position];
    photo.src = 'photos/' + String(id).padStart(2, '0') + '.webp';
    photo.alt = memorialPhotoDescriptions[id - 1];
    let caption = 'A few old memories with my friend.';
    if (id === 4 || id === 5) caption = 'Protecting me while I worked as kitten:';
    if (id === 6) caption = 'Keeping guard of my monitor in the early days:';
    if (work.includes(id)) caption = 'And years later protecting my computer from all sides...';
    if (chair.includes(id)) caption = 'As an old lady she loved stealing warm computer chairs to become the lead programmer:';
    document.querySelector('#caption').textContent = caption.replace(/:$/, '.');
    const verse = memorialPhotoMemories.get(id);
    memory.replaceChildren();
    if (verse) memory.append(...verse.cloneNode(true).childNodes);
    memory.hidden = !verse;
    document.querySelector('#count').textContent = (position + 1) + ' / ' + slides.length;
  }
  function step(delta) {
    position = (position + delta + slides.length) % slides.length;
    showPhoto();
  }
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-open]');
    if (!trigger) return;
    const key = trigger.dataset.open;
    const reading = key === 'poems';
    gallery.hidden = reading;
    poems.hidden = !reading;
    document.querySelector('#dialog-title').textContent = reading ? 'A few old memories with my friend' : chapters[key][0];
    if (!reading) {
      slides = chapters[key][1];
      position = Math.max(0, slides.indexOf(Number(trigger.dataset.photo)));
      showPhoto();
    }
    viewer.showModal();
    viewer.scrollTop = 0;
  });
  document.querySelector('#previous').onclick = () => step(-1);
  document.querySelector('#next').onclick = () => step(1);
  document.querySelector('.close').onclick = () => viewer.close();
  viewer.addEventListener('click', event => {
    if (event.target !== viewer) return;
    const rect = viewer.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) viewer.close();
  });
  viewer.addEventListener('keydown', event => {
    if (gallery.hidden) return;
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });
})();

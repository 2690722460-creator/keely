(function (scope) {
  'use strict';
  var labels = Object.freeze({brand_ip:'品牌IP设计',aigc_video:'动态影像',ad_visual:'视觉创作',stage_design:'舞台空间设计',personal:'UI设计',marketing_clips:'营销切片'});
  function fail() { throw new Error('作品数据格式无效。'); }
  function plain(value, max, required) {
    if (typeof value !== 'string' || value.length > max || /\u0000/.test(value) || (required && !value.trim())) fail();
    return value;
  }
  function mediaUrl(value) {
    if (typeof value !== 'string' || !value || value.length > 16384 || /[\u0000-\u0020\u007f"'<>\\]/.test(value)) fail();
    var decoded;
    try { decoded = decodeURIComponent(value); } catch (_) { fail(); }
    if (/[\u0000-\u0020\u007f"'<>\\]/.test(decoded)) fail();
    if (value.indexOf('assets/') === 0) {
      if (!/^assets\/[A-Za-z0-9_./%-]+$/.test(value) || /%2f|%5c/i.test(value) || decoded.split('/').some(function (part) { return part === '.' || part === '..' || !part; })) fail();
      if (!/\.(?:jpe?g|png|webp|gif|avif|mp4|webm)$/i.test(decoded)) fail();
      return value;
    }
    try {
      var url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) fail();
      return url.href;
    } catch (_) { fail(); }
  }
  function normalizeWork(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.prototype.hasOwnProperty.call(labels, input.category)) fail();
    var work = {
      id: plain(input.id, 128, true),
      title: plain(input.title, 160, true),
      category: input.category,
      catLabel: labels[input.category],
      description: plain(input.description, 12000, false),
      img: mediaUrl(input.img),
      gallery: []
    };
    if (!/^[A-Za-z0-9_-]+$/.test(work.id)) fail();
    var gallery = input.gallery === undefined ? [] : input.gallery;
    var videos = input.videos === undefined ? [] : input.videos;
    if (!Array.isArray(gallery) || !Array.isArray(videos) || gallery.length + videos.length > 50) fail();
    gallery.forEach(function (item) {
      if (typeof item === 'string') work.gallery.push(mediaUrl(item));
      else if (item && typeof item === 'object' && !Array.isArray(item) && item.type === 'video') {
        work.gallery.push({type:'video',src:mediaUrl(item.src),poster:item.poster ? mediaUrl(item.poster) : work.img});
      } else fail();
    });
    videos.forEach(function (item) {
      if (typeof item === 'string') work.gallery.push({type:'video',src:mediaUrl(item),poster:work.img});
      else if (item && typeof item === 'object' && !Array.isArray(item)) work.gallery.push({type:'video',src:mediaUrl(item.src),poster:item.poster ? mediaUrl(item.poster) : work.img});
      else fail();
    });
    if (!work.gallery.length) work.gallery.push(work.img);
    return work;
  }
  function normalizeResponse(input) {
    if (!input || typeof input !== 'object' || input.ok !== true || !Array.isArray(input.works) || input.works.length > 1000) fail();
    var ids = Object.create(null);
    return input.works.map(function (inputWork) {
      var work = normalizeWork(inputWork);
      if (ids[work.id]) fail();
      ids[work.id] = true;
      return work;
    });
  }
  async function fetchPublished(options) {
    options = options || {};
    var protocol = options.protocol || (scope.location && scope.location.protocol) || 'file:';
    if (protocol !== 'http:' && protocol !== 'https:') return {state:'bundled',reason:'file'};
    var fetcher = options.fetchImpl || scope.fetch;
    if (typeof fetcher !== 'function') return {state:'bundled',reason:'unavailable'};
    var controller = new AbortController();
    var timer;
    try {
      var timeout = new Promise(function (_, reject) {
        timer = setTimeout(function () { controller.abort(); reject(new Error('timeout')); }, options.timeoutMs || 8000);
      });
      var request = (async function () {
        var response = await fetcher('/api/works', {method:'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
        if (!response || response.status !== 200 || !response.ok) throw new Error('unavailable');
        var works = normalizeResponse(await response.json());
        return {state:'online',works:works};
      })();
      return await Promise.race([request, timeout]);
    } catch (_) {
      return {state:'bundled',reason:'unavailable'};
    } finally { clearTimeout(timer); }
  }
  function hasHiddenTitle(work) {
    return (work.category === 'ad_visual' && work.title === labels.ad_visual) ||
      (work.category === 'aigc_video' && work.title === labels.aigc_video) ||
      (work.category === 'marketing_clips' && /^\d{1,2}月\d{1,2}日(?:\s*[（(]\d+[）)])?$/.test(work.title.trim()));
  }
  function displayTitle(work) {
    return hasHiddenTitle(work) ? labels[work.category] : work.title;
  }
  function renderCards(grid, works, onSelect) {
    var document = grid.ownerDocument;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    if (!works.length) {
      var empty = document.createElement('p');
      empty.className = 'works-empty';
      empty.textContent = '此分类暂无已发布作品。';
      grid.appendChild(empty);
      return;
    }
    works.forEach(function (work, index) {
      var card = document.createElement('div');
      card.className = 'work-card reveal-item seal-stamp';
      card.dataset.index = String(index);
      card.style.animationDelay = (index * 0.08) + 's';
      ['tl','tr','bl','br'].forEach(function (position) {
        var corner = document.createElement('div');
        corner.className = 'song-corner ' + position;
        card.appendChild(corner);
      });
      var imageWrap = document.createElement('div');
      imageWrap.className = 'work-img-wrap';
      var image = document.createElement('img');
      image.src = mediaUrl(work.img);
      image.alt = displayTitle(work);
      image.decoding = 'async';
      image.loading = 'lazy';
      imageWrap.appendChild(image);
      card.appendChild(imageWrap);
      var info = document.createElement('div');
      info.className = 'work-info';
      [['span','work-cat',labels[work.category]],['h3','work-title',work.title],['p','work-desc',work.description]].forEach(function (field) {
        if (field[1] === 'work-title' && hasHiddenTitle(work)) return;
        var element = document.createElement(field[0]);
        element.className = field[1];
        element.textContent = field[2];
        info.appendChild(element);
      });
      card.appendChild(info);
      card.addEventListener('click', function () { onSelect(work); });
      grid.appendChild(card);
    });
  }
  scope.PortfolioData = Object.freeze({labels:labels,mediaUrl:mediaUrl,normalizeWork:normalizeWork,normalizeResponse:normalizeResponse,fetchPublished:fetchPublished,renderCards:renderCards,displayTitle:displayTitle});
})(typeof window !== 'undefined' ? window : globalThis);

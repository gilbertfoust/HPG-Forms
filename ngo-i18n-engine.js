(() => {
  const KEY = 'hpg_ngo_questionnaire_language_v1';
  const LANGS = ['en','fr','es','ar'];
  const originalText = new WeakMap();
  const originalAttrs = new WeakMap();
  let observer;

  function initialLanguage() {
    const saved = localStorage.getItem(KEY);
    if (LANGS.includes(saved)) return saved;
    const browser = (navigator.language || 'en').slice(0,2).toLowerCase();
    return LANGS.includes(browser) ? browser : 'en';
  }

  function translateDocument(doc, lang, dict) {
    if (!doc || !doc.body) return;
    doc.documentElement.lang = lang;
    doc.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT','STYLE','NOSCRIPT'].includes(parent.tagName)) continue;
      if (!originalText.has(node)) originalText.set(node, node.nodeValue || '');
      const original = originalText.get(node) || '';
      const key = original.trim();
      if (!key) continue;
      if (lang === 'en') node.nodeValue = original;
      else if (dict[key]) {
        const before = (original.match(/^\s*/) || [''])[0];
        const after = (original.match(/\s*$/) || [''])[0];
        node.nodeValue = before + dict[key] + after;
      }
    }

    doc.querySelectorAll('[placeholder],[title],[aria-label]').forEach((el) => {
      ['placeholder','title','aria-label'].forEach((attr) => {
        if (!el.hasAttribute(attr)) return;
        let saved = originalAttrs.get(el);
        if (!saved) { saved = {}; originalAttrs.set(el, saved); }
        if (!(attr in saved)) saved[attr] = el.getAttribute(attr) || '';
        const original = saved[attr];
        el.setAttribute(attr, lang === 'en' ? original : (dict[original.trim()] || original));
      });
    });
  }

  window.HPGNgoI18n = {
    initialLanguage,
    mount({ frame, select, label, dictionaries, labels }) {
      const apply = () => {
        const lang = select.value;
        localStorage.setItem(KEY, lang);
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        label.textContent = labels[lang];
        const doc = frame.contentDocument;
        if (!doc || !doc.body) return;
        translateDocument(doc, lang, dictionaries[lang] || {});
        if (observer) observer.disconnect();
        observer = new MutationObserver(() => translateDocument(doc, lang, dictionaries[lang] || {}));
        observer.observe(doc.body, { childList:true, subtree:true });
      };
      select.value = initialLanguage();
      select.addEventListener('change', apply);
      frame.addEventListener('load', apply);
    }
  };
})();
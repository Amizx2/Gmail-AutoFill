const i18n = {
    en: {
        subtitle: "Gmail AutoFill",
        autofill_label: "Auto-fill from Gmail",
        autofill_desc: "If disabled, a floating button will appear next to code inputs.",
        language: "Language"
    },
    ru: {
        subtitle: "Gmail Автокод",
        autofill_label: "Автоподстановка",
        autofill_desc: "Если выключено, рядом с полем ввода появится кнопка для извлечения кода.",
        language: "Язык"
    }
};

document.addEventListener('DOMContentLoaded', () => {
    let cb = document.getElementById('autoFillCb');
    let langSelect = document.getElementById('langSelect');
    
    chrome.storage.local.get(['autoFill', 'lang'], (res) => {
        cb.checked = res.autoFill !== false;
        
        let currentLang = res.lang || 'en';
        langSelect.value = currentLang;
        updateUI(currentLang);
    });

    cb.addEventListener('change', () => {
        chrome.storage.local.set({ autoFill: cb.checked });
    });
    
    langSelect.addEventListener('change', () => {
        let selectedLang = langSelect.value;
        chrome.storage.local.set({ lang: selectedLang });
        updateUI(selectedLang);
    });
});

function updateUI(lang) {
    const dict = i18n[lang] || i18n.en;
    document.getElementById('t-subtitle').textContent = dict.subtitle;
    document.getElementById('t-autofill-label').textContent = dict.autofill_label;
    document.getElementById('t-autofill-desc').textContent = dict.autofill_desc;
    document.getElementById('t-language').textContent = dict.language;
}

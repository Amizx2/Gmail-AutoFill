let checkingCode = false;
let currentTooltip = null;
let currentInput = null;

// Настройки
let autoFill = true;
chrome.storage.local.get(['autoFill'], (res) => { if (res.autoFill !== undefined) autoFill = res.autoFill; });
chrome.storage.onChanged.addListener((changes) => { if (changes.autoFill) autoFill = changes.autoFill.newValue; });

// Кешируем bodyText чтобы избежать reflow при каждом focusin
let _cachedBodyText = null;
let _bodyTextDirty = true;
try {
    new MutationObserver(() => { _bodyTextDirty = true; })
        .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
} catch(e) {}

function getBodyText() {
    if (_bodyTextDirty && document.body) {
        _cachedBodyText = document.body.innerText.toLowerCase();
        _bodyTextDirty = false;
    }
    return _cachedBodyText || '';
}

function isOtpField(input) {
    if (input.tagName !== 'INPUT') return false;
    // Убрали 'password' — не нужно срабатывать на обычные поля пароля
    if (input.type !== 'text' && input.type !== 'number' && input.type !== 'tel') return false;
    if (input.autocomplete === 'one-time-code') return true;
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();
    const placeholder = (input.placeholder || '').toLowerCase();
    const keywords = ['code', 'otp', '2fa', 'pin', 'код', 'token', 'verification', 'auth', 'passcode'];
    for (let kw of keywords) {
        if (name.includes(kw) || id.includes(kw) || placeholder.includes(kw)) return true;
    }
    // Используем кеш вместо прямого вызова innerText
    const bodyText = getBodyText();
    const triggerPhrases = ['enter code', 'confirm your email', 'sent a code', 'verification code', 'код подтверждения', 'введите код', 'отправили код', 'код из письма', 'укажите код'];
    for (let phrase of triggerPhrases) {
        if (bodyText.includes(phrase)) return true;
    }
    if (input.maxLength === 6 && input.type === 'text') return true;
    return false;
}

// isClickable=true убирает pointer-events:none — нужно для тултипов со ссылкой
function showTooltip(input, text, type = "loading", autoHide = false, isClickable = false) {
    if (currentTooltip) currentTooltip.remove();

    if (!document.getElementById('gce-apple-styles')) {
        let style = document.createElement('style');
        style.id = 'gce-apple-styles';
        style.textContent = `
            @keyframes gce-spring-in { 0% { transform: scale(0.8); opacity: 0; } 60% { transform: scale(1.05); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
            @keyframes gce-spring-out { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(0.9); opacity: 0; } }
        `;
        document.head.appendChild(style);
    }

    let tooltip = document.createElement('div');
    let bgColor = "rgba(255, 255, 255, 0.85)";
    let textColor = "#000";
    let icon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 2s linear infinite;"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg><style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>`;

    if (type === "success") { icon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`; textColor = "#34c759"; }
    if (type === "error")   { icon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`; textColor = "#ff3b30"; }

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        bgColor = "rgba(28, 28, 30, 0.75)";
        if (type === "loading") textColor = "#fff";
    }

    tooltip.innerHTML = `<span style="margin-right:8px; display:flex; align-items:center;">${icon}</span><span>${text}</span>`;
    tooltip.style.cssText = `
        position: absolute; display: flex; align-items: center; background: ${bgColor}; color: ${textColor};
        padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        z-index: 999999; box-shadow: 0 4px 14px rgba(0,0,0,0.1), 0 0 1px rgba(0,0,0,0.2);
        backdrop-filter: blur(12px) saturate(180%); -webkit-backdrop-filter: blur(12px) saturate(180%);
        pointer-events: ${isClickable ? 'auto' : 'none'}; letter-spacing: -0.1px;
        animation: gce-spring-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    `;
    let rect = input.getBoundingClientRect();
    tooltip.style.top  = (rect.top  - 46 + window.scrollY) + 'px';
    tooltip.style.left = (rect.left      + window.scrollX) + 'px';
    document.body.appendChild(tooltip);
    currentTooltip = tooltip;

    if (autoHide) {
        setTimeout(() => {
            if (tooltip.parentNode) {
                tooltip.style.animation = "gce-spring-out 0.25s ease-out forwards";
                setTimeout(() => { if (tooltip.parentNode) tooltip.remove(); }, 250);
            }
        }, 3000);
    }
}

function showMagicLinkCard(input, link) {
    if (currentTooltip) currentTooltip.remove();

    let domain = '';
    try { domain = new URL(link).hostname; } catch(e) {}

    const isRu = currentLang === 'ru';
    const label   = isRu ? 'Ссылка для входа' : 'Login link';
    const btnText = isRu ? 'Открыть' : 'Open';
    const fromText = isRu ? 'из письма' : 'from email';

    const card = document.createElement('div');
    card.id = 'gce-magic-card';
    card.style.cssText = `
        position: absolute; z-index: 999999; width: 260px;
        background: rgba(30,30,32,0.82);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.28), 0 0 0 0.5px rgba(255,255,255,0.08);
        padding: 14px 16px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
        animation: gce-spring-in 0.45s cubic-bezier(0.175,0.885,0.32,1.275) forwards;
        pointer-events: auto;
    `;
    card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div style="width:36px;height:36px;border-radius:10px;
                background:linear-gradient(145deg,#1a73e8,#0A84FF);
                display:flex;align-items:center;justify-content:center;flex-shrink:0;
                box-shadow:0 2px 8px rgba(10,132,255,0.4);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <div>
                <div style="color:#fff;font-size:13px;font-weight:600;letter-spacing:-0.1px;">${label}</div>
                <div style="color:rgba(235,235,245,0.5);font-size:11px;margin-top:1px;">${domain || fromText}</div>
            </div>
        </div>
        <a href="${link}" target="_blank" style="
            display:flex;align-items:center;justify-content:center;gap:6px;
            background:#0A84FF;color:#fff;border-radius:10px;padding:10px 0;
            font-size:14px;font-weight:600;letter-spacing:-0.1px;
            text-decoration:none;box-shadow:0 2px 10px rgba(10,132,255,0.4);
            transition:opacity 0.15s;"
            onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
            ${btnText}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>`;

    let rect = input.getBoundingClientRect();
    card.style.top  = (rect.top - 145 + window.scrollY) + 'px';
    card.style.left = (rect.left + window.scrollX) + 'px';
    document.body.appendChild(card);
    currentTooltip = card;

    setTimeout(() => {
        if (card.parentNode) {
            card.style.animation = 'gce-spring-out 0.25s ease-out forwards';
            setTimeout(() => { if (card.parentNode) card.remove(); }, 250);
        }
    }, 8000);
}

function fillCode(input, code) {
    const pasteEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
    pasteEvent.clipboardData.setData('text/plain', code);
    input.dispatchEvent(pasteEvent);
    if (input.maxLength === 1) {
        // Optional chaining защищает от NPE если parentElement == null
        let container = input.closest('form') || input.parentElement?.parentElement;
        if (container) {
            let inputs = Array.from(container.querySelectorAll('input:not([type="hidden"])')).filter(i => i.maxLength === 1 || i.classList.contains(input.className));
            let currentIndex = inputs.indexOf(input);
            if (currentIndex !== -1 && inputs.length > 1) {
                for (let i = 0; i < code.length && (currentIndex + i) < inputs.length; i++) {
                    let targetInput = inputs[currentIndex + i];
                    targetInput.value = code[i];
                    targetInput.dispatchEvent(new Event('input',  { bubbles: true }));
                    targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
                return;
            }
        }
    }
    if (input.value !== code) {
        input.value = code;
        input.dispatchEvent(new Event('input',  { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

let currentLang = 'en';
chrome.storage.local.get(['lang'], (res) => { if (res.lang) currentLang = res.lang; });

const msgs = {
    en: { check: "Checking Gmail...", err: "Code not found" },
    ru: { check: "Проверка Gmail...", err: "Код не найден" }
};

// Принимаем результат, который background присылает через chrome.tabs.sendMessage
chrome.runtime.onMessage.addListener((request) => {
    if (request.action !== "codeResult") return;

    clearTimeout(_safetyTimer); // отменяем safety-таймер — ответ получен
    checkingCode = false;
    const input = currentInput;
    if (!input) return;

    const text = msgs[currentLang] || msgs.en;
    const checkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

    if (request.code) {
        // Clipboard доступен в content script — работает без проблем
        navigator.clipboard.writeText(request.code).catch(() => {});
        fillCode(input, request.code);
        let msg = currentLang === 'ru' ? `Код ${request.code} вставлен` : `Code ${request.code} inserted`;
        showTooltip(input, msg, "success", true);
    } else if (request.link) {
        // Apple HIG стиль — отдельная карточка вместо pill-тултипа
        showMagicLinkCard(input, request.link);
    } else {
        showTooltip(input, text.err, "error", true);
    }
});

let _safetyTimer = null;

function triggerCheck(input) {
    if (checkingCode) return;
    checkingCode = true;
    currentInput = input;
    let text = msgs[currentLang] || msgs.en;
    showTooltip(input, text.check, "loading");

    // Safety: если за 35 сек ответ не пришёл — сбрасываем состояние
    _safetyTimer = setTimeout(() => {
        if (checkingCode) {
            checkingCode = false;
            showTooltip(input, text.err, "error", true);
            console.warn("[GCE] Safety timeout — no codeResult received in 35s");
        }
    }, 35000);

    chrome.runtime.sendMessage({ action: "checkForCode", hostname: window.location.hostname });
}

// Кнопка ручного запуска
let injectedButtons = new WeakSet();
function injectManualButton(input) {
    if (injectedButtons.has(input)) return;
    injectedButtons.add(input);

    let btn = document.createElement('div');
    let isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    let bgColor   = isDark ? "rgba(28, 28, 30, 0.85)" : "rgba(255, 255, 255, 0.95)";
    let textColor = isDark ? "#fff" : "#000";

    let defaultText = currentLang === 'ru' ? "Достать код из почты" : "Extract from Gmail";
    let svgIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;

    btn.style.cssText = `
        position: absolute; display: flex; align-items: center;
        background: ${bgColor}; color: ${textColor};
        padding: 8px 16px; border-radius: 20px; cursor: pointer;
        font-size: 14px; font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        z-index: 999999; box-shadow: 0 4px 14px rgba(0,0,0,0.1), 0 0 1px rgba(0,0,0,0.2);
        backdrop-filter: blur(12px) saturate(180%); -webkit-backdrop-filter: blur(12px) saturate(180%);
        transition: transform 0.1s; letter-spacing: -0.1px;
    `;
    let rect = input.getBoundingClientRect();
    btn.style.top  = (rect.top  - 46 + window.scrollY) + 'px';
    btn.style.left = (rect.left      + window.scrollX) + 'px';

    // Кнопка показывается сразу с текстом — polling стартует ТОЛЬКО по клику
    btn.innerHTML = `${svgIcon} ${defaultText}`;
    btn.onmousedown = (e) => {
        e.preventDefault();
        btn.remove();
        triggerCheck(input);
    };

    btn.onmouseover = () => btn.style.transform = "scale(1.03)";
    btn.onmouseout  = () => btn.style.transform = "scale(1)";

    document.body.appendChild(btn);

    input.addEventListener('focusout', () => {
        setTimeout(() => {
            if (btn.parentNode) btn.remove();
            injectedButtons.delete(input);
        }, 200);
    }, { once: true });
}

document.addEventListener('focusin', (e) => {
    if (window.location.hostname.includes("mail.google.com")) return;
    if (e.target.tagName === 'INPUT') {
        currentInput = e.target;
        if (isOtpField(e.target)) {
            if (autoFill) {
                triggerCheck(e.target);
            } else {
                injectManualButton(e.target);
            }
        }
    }
});

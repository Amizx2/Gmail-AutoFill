const keywordRegex = /code|код|пароль|password|pin|пин|confirm|verify|подтвер/i;

// Декодирует HTML-сущности — нужно для Atom Feed, где HTML письма бывают двойно закодированы
function decodeEntities(str) {
    return str
        .replace(/&amp;/gi,  '&')
        .replace(/&lt;/gi,   '<')
        .replace(/&gt;/gi,   '>')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#(\d+);/g,    (_, n) => String.fromCharCode(+n))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractCodes(text) {
    let codes = new Set();
    let match;
    let r1 = /(?:^|[^\w])(?:G-)?(\d{4,8})(?=[^\w]|$)/g;
    while ((match = r1.exec(text)) !== null) { codes.add(match[1]); }
    let r2 = /(?:^|[^\w])(\d{3}[\s-]\d{3})(?=[^\w]|$)/g;
    while ((match = r2.exec(text)) !== null) { codes.add(match[1].replace(/[\s-]/g, '')); }

    if (codes.size === 0) {
        if (keywordRegex.test(text)) {
            let r3 = /(?:^|[^\w])([A-Z0-9]{4,8})(?=[^\w]|$)/gi;
            while ((match = r3.exec(text)) !== null) {
                let code = match[1].toUpperCase();
                if (/[0-9]/.test(code) && /[A-Z]/.test(code)) {
                    codes.add(code);
                } else if (code.length >= 5 && /^[A-Z]+$/.test(code)) {
                    codes.add(code);
                }
            }
        }
    }
    return Array.from(codes);
}

async function fetchGmailFeed(userIndex) {
    try {
        let res = await fetch(`https://mail.google.com/mail/u/${userIndex}/feed/atom`, { credentials: 'include' });
        if (!res.ok) {
            console.log(`[GCE] Feed u/${userIndex}: HTTP ${res.status}`);
            return null;
        }
        return await res.text();
    } catch(e) {
        console.log(`[GCE] Feed u/${userIndex} fetch error:`, e.message);
        return null;
    }
}

// Отслеживаем вкладки, для которых уже идёт polling
const pollingTabs = new Set();

async function pollForCode(tabId, hostname) {
    if (pollingTabs.has(tabId)) {
        console.log(`[GCE] Tab ${tabId} already polling — skip`);
        return;
    }
    pollingTabs.add(tabId);
    console.log(`[GCE] Start polling tab=${tabId} host=${hostname}`);

    let domain = "";
    if (hostname) {
        let parts = hostname.split('.');
        domain = parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : hostname.toLowerCase();
    }

    const startTime = Date.now();
    let attempts = 0;
    const maxAttempts = 6;   // 6 × 5 сек = 30 секунд максимум
    const interval   = 5000;

    const sendResult = (result) => {
        pollingTabs.delete(tabId);
        console.log(`[GCE] sendResult tab=${tabId}`, result);
        chrome.tabs.sendMessage(tabId, { action: "codeResult", ...result })
            .catch(e => console.log(`[GCE] sendMessage error:`, e.message));
    };

    const check = async () => {
        try {
            attempts++;
            console.log(`[GCE] Attempt ${attempts}/${maxAttempts}`);
            let foundCode = null;

            for (let i = 0; i < 3; i++) {
                let xml = await fetchGmailFeed(i);
                if (!xml || foundCode) continue;

                let entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
                let match;
                while ((match = entryRegex.exec(xml)) !== null) {
                    let entry = match[1];
                    let title   = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(entry)   || [])[1] || "";
                    let summary = (/<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(entry) || [])[1] || "";
                    let issued  = (/<(?:issued|modified)[^>]*>([\s\S]*?)<\/(?:issued|modified)>/i.exec(entry) || [])[1] || "";

                    // Декодируем entities и чистим теги
                    summary = decodeEntities(summary).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    title   = decodeEntities(title).replace(/&nbsp;/gi, ' ').trim();

                    // Тело письма без метаданных (author, дата, id, links содержат числа-не-коды)
                    let bodyOnly = entry
                        .replace(/<author>[\s\S]*?<\/author>/gi, '')
                        .replace(/<issued>[\s\S]*?<\/issued>/gi, '')
                        .replace(/<modified>[\s\S]*?<\/modified>/gi, '')
                        .replace(/<id>[\s\S]*?<\/id>/gi, '')
                        .replace(/<link[^>]*\/?>/gi, '');
                    let entryText = decodeEntities(bodyOnly)
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, ' ') // email-адреса
                        .replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?\b/g, ' ')            // ISO-даты
                        .replace(/\s+/g, ' ');

                    let date = new Date(issued);
                    if (isNaN(date.getTime())) date = new Date();

                    // fullText включает оригинальный entry для domain-check (там есть from-адрес)
                    let fullText = (title + " " + summary + " " + entry).toLowerCase();

                    let isDomainMatch = domain && domain.length >= 2 && fullText.includes(domain);
                    // Фолбэк: если OTP-ключевые слова есть в письме — не требуем domain-match
                    let hasOtpKeyword = keywordRegex.test(title + " " + summary);
                    let isRecent = (startTime - date.getTime()) <= 5 * 60 * 1000;

                    console.log(`[GCE] Entry: isRecent=${isRecent} isDomainMatch=${isDomainMatch} hasOtp=${hasOtpKeyword} title="${title.slice(0,40)}"`);

                    if (isRecent && (isDomainMatch || hasOtpKeyword)) {
                        let searchText = title + " " + summary + " " + entryText;
                        // Убираем URL перед поиском кода — иначе r3 матчит "HTTPS", "TOKEN" и т.д.
                        // Magic link ищется отдельно через linkRegex ниже
                        let searchTextNoUrls = searchText.replace(/https?:\/\/\S+/gi, ' ');
                        let codes = extractCodes(searchTextNoUrls);
                        console.log(`[GCE] Codes found:`, codes);

                        if (codes.length > 0) {
                            foundCode = codes[0];
                            break;
                        } else {
                            let linkRegex = /https:\/\/[a-zA-Z0-9.\-_/?&=%#]+/gi;
                            let linkMatch;
                            while ((linkMatch = linkRegex.exec(entry)) !== null) {
                                let link = linkMatch[0];
                                if (/(login|verify|magic|auth|signin|confirm|session)/i.test(link)) {
                                    foundCode = { link };
                                    break;
                                }
                            }
                            if (foundCode) break;
                        }
                    }
                }
                if (foundCode) break;
            }

            if (foundCode) {
                if (typeof foundCode === 'object' && foundCode.link) {
                    sendResult({ link: foundCode.link });
                } else {
                    sendResult({ code: foundCode });
                }
                return;
            }

            if (attempts < maxAttempts) {
                setTimeout(check, interval);
            } else {
                console.log(`[GCE] Max attempts reached, giving up`);
                sendResult({ code: null });
            }
        } catch (err) {
            // Гарантируем что polling всегда завершается, даже при неожиданной ошибке
            console.error(`[GCE] check() error:`, err);
            sendResult({ code: null, error: err.message });
        }
    };

    check();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "checkForCode") {
        const tabId = sender.tab?.id;
        console.log(`[GCE] checkForCode from tab=${tabId} host=${request.hostname}`);
        if (tabId) {
            pollForCode(tabId, request.hostname);
        }
        sendResponse({ started: true });
        return false;
    }
});

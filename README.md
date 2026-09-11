# Gmail-AutoFill

**Automatically insert verification codes and magic links from your inbox directly into websites.**

Tired of constantly switching to your email tab, opening a new message, copying a 6-digit code, and switching back? **Gmail AutoFill** does it for you! The extension automatically finds recent emails with verification codes (2FA, OTP) or login links (Magic Links) and instantly pastes them into the required fields on websites.

## ✨ Features and benefits

*   **Multi-account support (Multi-login):** The extension automatically checks up to 3 active Gmail accounts simultaneously, so your code will be found regardless of which inbox it was sent to.
*   **Smart algorithm:** The script filters emails based on the domain of the website you are currently on and ignores old messages (older than 1 minute). You will never paste an outdated code by mistake.
*   **Magic Links support:** If a website sends an authorization link (Login link) instead of a numeric code, the extension will find it and offer to open it in one click.
*   **Two operation modes:** Turn on AutoFill for full automation, or turn it off to use a convenient floating button for manual code extraction only when you need it.

## ⚙️ How it works

The extension doesn't require you to enter your email password or grant complex permissions. It works directly through your current browser session. You just need to be logged into Gmail in any tab or window. When you click on a code input field on any website, the script silently checks your email and extracts the necessary digits.

## 🔒 Security and privacy

*   **No third-party servers:** The extension runs 100% locally in your browser. Your emails, codes, and links are never sent anywhere or stored on third-party servers.
*   **Official communication channel:** To check your inbox, it strictly uses Google's standard and secure RSS feed (Gmail Atom Feed).
*   **Minimal permissions:** The program does not require access to your passwords or the ability to manage your mailbox (it cannot delete or send emails). It only reads the feed at the exact moment it's waiting for a code.

## 📥 Installation

You can download the ready-made extensions from the **[Releases](../../releases)** page.

### Google Chrome / Chromium / Edge
1. Download `gmail-code-extractor-chrome.zip` from the **Releases** tab and extract it into a folder.
2. Open your browser and go to `chrome://extensions/` (or `edge://extensions/`).
3. Enable **Developer mode** (toggle in the top right corner).
4. Click **Load unpacked** and select the folder where you extracted the extension.

### Mozilla Firefox
1. Download `gmail-code-extractor.xpi` from the **Releases** tab.
2. Open Firefox and go to `about:addons`.
3. Click the gear icon ⚙️ and select **Install Add-on From File...**.
4. Choose the downloaded `.xpi` file and click **Add**.

---
*Automatically detects code input fields on websites and retrieves the code from Gmail.*

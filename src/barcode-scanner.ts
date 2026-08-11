import { BrowserMultiFormatReader } from "@zxing/browser";

let controls: { stop: () => void } | null = null;
let modal: HTMLDivElement | null = null;

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function closeScanner() {
  try { controls?.stop(); } catch { /* ignore */ }
  controls = null;
  modal?.remove();
  modal = null;
}

function openScanner(input: HTMLInputElement) {
  closeScanner();

  modal = document.createElement("div");
  modal.dir = "rtl";
  modal.style.cssText = "position:fixed;inset:0;z-index:999999;background:rgba(15,12,24,.62);display:grid;place-items:center;padding:20px;backdrop-filter:blur(5px)";

  const card = document.createElement("section");
  card.style.cssText = "width:min(620px,96vw);background:#fff;border-radius:18px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.28);font-family:Segoe UI,Tahoma,Arial,sans-serif";

  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px";
  const title = document.createElement("div");
  title.innerHTML = "<strong style='font-size:18px'>قراءة الباركود بالكاميرا</strong><div style='font-size:12px;color:#77808d;margin-top:3px'>وجّه الكاميرا نحو الباركود وانتظر القراءة</div>";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.title = "إغلاق";
  close.style.cssText = "width:38px;height:38px;padding:0;border-radius:10px;font-size:25px;background:#f2f4f7";
  close.onclick = closeScanner;
  head.append(title, close);

  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.style.cssText = "display:block;width:100%;max-height:420px;object-fit:cover;background:#111;border-radius:14px";

  const status = document.createElement("div");
  status.textContent = "جاري تشغيل الكاميرا...";
  status.style.cssText = "padding:10px 2px 2px;color:#66707d;font-size:13px;text-align:center";

  card.append(head, video, status);
  modal.appendChild(card);
  document.body.appendChild(modal);

  const reader = new BrowserMultiFormatReader();
  void (async () => {
    try {
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const preferred = devices.find((d) => /back|rear|environment|خلف/i.test(d.label)) || devices[0];
      controls = await reader.decodeFromVideoDevice(preferred?.deviceId, video, (result, error) => {
        if (result) {
          const value = result.getText().trim();
          if (value) {
            setReactInputValue(input, value);
            status.textContent = `تمت قراءة الرمز: ${value}`;
            setTimeout(closeScanner, 350);
          }
          return;
        }
        if (error && !String(error).includes("NotFoundException")) status.textContent = "وجّه الكاميرا نحو الباركود...";
      });
    } catch (error) {
      status.textContent = "تعذر تشغيل الكاميرا. يمكنك استعمال قارئ الباركود USB داخل خانة الرمز.";
      console.error("barcode camera scanner failed", error);
    }
  })();
}

function installBarcodeButton() {
  document.querySelectorAll<HTMLElement>(".barcode-input-wrap").forEach((wrap) => {
    if (wrap.querySelector("[data-camera-barcode]")) return;
    const input = wrap.querySelector<HTMLInputElement>("input");
    if (!input) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.cameraBarcode = "true";
    button.title = "قراءة الباركود بالكاميرا";
    button.textContent = "📷";
    button.style.cssText = "width:40px;height:38px;padding:0;background:#f5efff;color:#7c3aed;font-size:17px;flex:0 0 auto";
    button.onclick = () => openScanner(input);
    wrap.appendChild(button);
  });
}

const observer = new MutationObserver(installBarcodeButton);
observer.observe(document.documentElement, { childList: true, subtree: true });
installBarcodeButton();
window.addEventListener("beforeunload", closeScanner);

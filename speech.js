// 語音輸入（瀏覽器內建語音辨識，免費、不需要 API 金鑰）
// 注意：目前僅 Chrome / Edge 等 Chromium 系瀏覽器支援效果較好，Safari 支援度較差
export function createRecognizer({ onResult, onEnd, onError }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const rec = new SpeechRecognition();
  rec.lang = "zh-TW";
  rec.continuous = true;
  rec.interimResults = true;

  let finalText = "";

  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t;
      else interim += t;
    }
    onResult && onResult(finalText, interim);
  };
  rec.onend = () => onEnd && onEnd(finalText);
  rec.onerror = (e) => onError && onError(e.error);

  return {
    start: () => { finalText = ""; rec.start(); },
    stop: () => rec.stop()
  };
}

export function isSpeechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

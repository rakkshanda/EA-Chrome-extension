export function classify(headline = "") {
    const txt = headline.toLowerCase();
    const high = /(earnings|profit|loss|merger|acquisition|lawsuit|plunge|surge|recall|investigation|downgrade|upgrade|guidance|dividend|bankruptcy)/;
    const neutral = /(report|analysis|forecast|outlook|price target|coverage)/;
    if (high.test(txt)) return { label: "High Impact", className: "high" };
    if (neutral.test(txt)) return { label: "Neutral", className: "neutral" };
    return { label: "FYI", className: "fyi" };
}
  
# Nuvio-Plugin

مجموعة من مزوّدي البث (Scrapers) لتطبيق **Nuvio**، تجلب الأفلام والمسلسلات من عدة مواقع عربية وعالمية عبر واجهة موحّدة.

---

## 📁 هيكل المستودع

| المسار | الوصف |
|---|---|
| `manifest.json` | ملف التعريف الرئيسي الذي يقرأه Nuvio |
| `providers/` | ملفات JavaScript لكل مزوّد |
| `update-user-agent.js` | سكربت Node.js لتحديث الـ User-Agent في جميع المزوّدين |
| `.github/workflows/` | سير عمل GitHub Actions للتحديث التلقائي |

---

## 🧩 المزوّدون

| المُعرّف | الاسم | الوصف | الأنواع |
|---|---|---|---|
| `faselhd` | FaselHD | أفلام ومسلسلات عربية — 1080p فقط | movie, tv |
| `nuvio-cinemana` | Cinemana | Shabakaty Cinemana — 1080p | movie, tv, anime |
| `a111477` | 111477 | بث 1080p | movie, tv |
| `krmzi` | Krmzi | مسلسلات تركية — 1080p فقط | tv |
| `4khdhub` | 4KHDHub | أفلام ومسلسلات — 4K و 1080p، أكبر ملف أولاً | movie, tv |
| `2peckle` | 2Peckle | عبر PenguPlay — 4K و 1080p | movie, tv |
| `nuvio-cee` | Cee | أفلام ومسلسلات عربية | movie, tv, anime |
| `nuvio-moviebox` | MovieBox | مع دعم الدبلجة والترجمة | movie, tv |

---

## 🚀 التثبيت

### عبر Nuvio

1. افتح تطبيق **Nuvio**.
2. اذهب إلى **Settings → Plugins**.
3. أضف رابط المستودع:

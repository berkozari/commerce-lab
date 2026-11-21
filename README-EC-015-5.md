# CommerceLab — EC-015.5 GitHub Actions CI

## Amaç

EC-014'ten gelen mevcut `.github/workflows/ec014-quality.yml` zaten lint, TypeScript, build, API/Web Vitest + coverage gate ve 6 mocked Chromium E2E testini çalıştırıyor. **Aynı işleri ikinci kez çalıştıracak yeni bir workflow eklemiyoruz.** Bu paket onu **tek standart** `.github/workflows/ci.yml` workflow'una taşıyor; en az repository yetkisi, concurrency cancellation ve başarısız çalıştırmalarda da rapor yükleme ayarlarını ekliyor.

EC-015.6 (PostgreSQL CI integration) **bu paketin kapsamı dışında**. Bu workflow hiçbir secret istemez, gerçek DB'ye bağlanmaz ve migration/seed çalıştırmaz. `EC014_E2E_LIVE=0` zorunlu.

## Kurulum (CommerceLab root, feature/devops-ci-cd)

Önce `git status --short` ile çalışma alanını incele. ZIP'i Downloads'a indirip repo kökünde:

```bash
unzip -l "$HOME/Downloads/commerce-lab-EC-015-5-github-actions-ci.zip"
unzip -o "$HOME/Downloads/commerce-lab-EC-015-5-github-actions-ci.zip" -d .
node scripts/ec015-5-ci.mjs apply
node scripts/ec015-5-ci.mjs verify
git diff --check
git status --short
```

`apply`, mevcut eski workflow'u silmeden önce onun bilinen EC-014 workflow'u olduğunu kontrol eder ve ignored `.reports/ec015-5/ec014-quality.yml.backup` yoluna yedekler. **İki workflow'un aynı anda çalışmasını engeller.** İkinci kez çalıştırmak güvenlidir. Önceki workflow özel olarak değiştirilmişse işlem durur; dosyayı elle silme.

Git durumu beklenen şekilde eski workflow'un silinmesi ve `ci.yml` eklenmesi olarak görünür; staging sonrası Git rename olarak algılayabilir.

## Lokal doğrulama

EC-014 coverage baseline'ını değiştirme. Mevcut local tests çalıştırılmak istenirse:

```bash
bash scripts/ec014-6-quality-regression.sh --check
```

Bu, lint, production/test/E2E typecheck, build, 181 API, 78 Web ve 6 mocked E2E testlerini kapsar. **42 izole PostgreSQL + 1 live E2E bu workflow'da çalışmaz**, EC-015.6'da ayrı CI job olarak ele alınacak.

## Remote doğrulama / kapanış kriteri

Dosyaları gözden geçirdikten sonra uygun branch'e commit/push yap ve GitHub > Actions > **CommerceLab CI** workflow'unun son run'ını aç. `quality` job'unun başarılı olduğunu, coverage baseline gate'in PASS verdiğini ve artefact'ın yüklendiğini kontrol et.

Önemli: `apply` veya local smoke test tek başına uzaktaki GitHub CI'ın çalıştığını kanıtlamaz. EC-015.5 final onayı için **gerçek GitHub Actions run** gerekir. Bekleyen migration/DB işlemlerinin etkilenmemesi için CI'da herhangi bir production `DATABASE_URL` veya JWT secret kullanma.

İşlem Git commit, `git push`, `docker down`, migration, seed veya gerçek `.env` değişikliği yapmaz. Git staging/commit işlemleri bilinçli olarak manuel bırakılmıştır.

## Sorun çözümü

- `Missing required source file`: farklı repo root veya EC-014 dosyaları eksik; scripti bypass etme.
- `Unexpected modifications in legacy workflow`: mevcut CI farklılaşmış; `git diff -- .github/workflows/ec014-quality.yml` sonucunu incele.
- GitHub Actions fail: run'ın hata veren adımını ve gizli bilgi içermeyen logunu paylaş. Dependency install/Playwright/coverage baseline sorunlarını ilgili adım üzerinden değerlendir.

# CommerceLab — EC-015.8 Clean Install & Final CI Validation

**Hedef:** EC-015 DevOps milestone'unun güvenli biçimde kapanışı. Mevcut `ci.yml` içindeki iki job'ı bozmadan son bir statik CI kontrolü ekler ve commit edilmiş kodu **Git arşivinden oluşturulan geçici, temiz klasörde** yeniden kurup test eder.

## Paket

- `scripts/ec015-8-final.mjs`: üç mod: `apply`, `verify`, `clean`.
- `README-EC-015-8.md`: bu kullanım ve kapanış rehberi.

**Çok önemli:** Hiçbir mod `migrate reset`, `db push`, `db seed`, Docker stop/down, volume silme ya da mevcut proje içindeki `node_modules` silme işlemi yapmaz. `clean` yalnızca geçici bir `git archive HEAD` kopyasında `pnpm install --frozen-lockfile` / `prisma generate` / Chromium kurulumu / mevcut kalite regresyonunu çalıştırır. Veritabanı entegrasyon testleri, yalnızca GitHub Actions'ın *ayrı, geçici* PostgreSQL 17 servisinde çalıştırılır.

## 1 — Kurulum ve statik kontrol

CommerceLab proje kökünde ZIP'i aç:

```bash
unzip -o "$HOME/Downloads/commerce-lab-EC-015-8-final-validation.zip" -d .
node scripts/ec015-8-final.mjs apply
node scripts/ec015-8-final.mjs verify

git diff --check
git status --short
git diff -- .github/workflows/ci.yml
```

`apply`, kalite job'ına tek bir `Validate EC-015.8 final CI contract` adımı ekler; yeni job oluşturmaz. Zaten mevcutsa ikinci kez eklemez. Mevcut `.github/workflows/ci.yml` dosyasının ilk hâlini `.reports/ec015-8/ci.yml.before` altında saklar (Git-ignore kapsamındadır).

`verify`, EC-015.5, EC-015.6, EC-015.7 doğrulayıcılarını, Node.js 24 uyumlu Actions sürümlerini, iki job'ı, frozen install ve Chromium kontrollerini, PostgreSQL job izolasyonunu ve yanlışlıkla Git'e eklenen `.env`/üretilmiş dosyaları kontrol eder. **Gerçek Docker, veritabanı veya GitHub Actions çalıştırması yapmaz**. Git deposu gerektirir.

Beklenen son satır: `EC-015.8 STATIC VERIFY PASS`.

## 2 — Commit (temiz kurulumdan ÖNCE)

EC-015.7'nin dosyalarını henüz commit/push etmediysen bu commit'e dahil et; önceden commit edilmişlerse yeniden eklenmezler. Diff'i mutlaka incele:

```bash
git add .github/workflows/ci.yml \
  scripts/ec015-7-infrastructure.mjs \
  apps/api/tests/integration/health-readiness.test.ts \
  scripts/ec015-8-final.mjs \
  README-EC-015-8.md

git diff --cached --check
git diff --cached --stat
git commit -m "ci: finalize clean-install and infrastructure quality gates"
```

`clean` modu **bilerek yalnızca temiz ve commit edilmiş HEAD'i** kabul eder. Böylece commit edilmeyen dosyalar yanlışlıkla test edilmiş gibi görünmez. Git status'ta ilgisiz değişikliklerin varsa gözden geçirip ayrı commit/stash ile ayır; bu script Git işlemi yapmaz.

## 3 — Temiz kurulum ve regresyon

Yerel Node.js 22 veya üzeri, **pnpm 10**, Git, `tar`, internet erişimi ve Playwright Chromium kurulumu için yeterli disk alanı gerekir. Playwright portu **5187** boş olmalı; bu kontrol Docker geliştirme stack'inin 3000/5173/5433 portlarını kullanmaz.

```bash
node scripts/ec015-8-final.mjs clean
```

Akış:

1. Statik kontrolleri ve temiz Git çalışma ağacını doğrular.
2. `git archive HEAD` ile sistemin geçici klasöründe bir kaynak kopyası açar. `.env`, yerel `node_modules`, Docker volume ve untracked dosyalar kopyalanmaz.
3. Yalnızca geçici kopyada `pnpm install --frozen-lockfile` ve Prisma client generation çalıştırır. Gerçek veritabanına bağlanmaz.
4. Chromium kurulumunu kontrol eder/kurar.
5. Mevcut `bash scripts/ec014-6-quality-regression.sh --check` ile ESLint, TypeScript, build, API/Web coverage ve 6 mock Playwright E2E testini çalıştırır.
6. Başarıyla bitirirse yalnızca kendi geçici klasörünü temizler; rapor özetini `.reports/ec015-8/clean-install-summary.txt` içinde bırakır.

Beklenen son satır:

```
EC-015.8 CLEAN INSTALL PASS
```

Hata oluşursa geçici çalışma klasörü teşhis için tutulur ve yolu belirtilir. **Bu durumda PASS kabul etme.** Uygulamayı veya Docker'u yeniden kurmak, `docker compose down -v` kullanmak, `pnpm-lock.yaml` dosyasını yeniden oluşturmak gerekmez. Hatanın türüne göre çözüm belirlenir.

### Neden `clean` içinde 42 PostgreSQL testi yok?

Bu testlerin koruma kuralları yalnızca `127.0.0.1:5433` ve belirli test DB adlarını kabul eder; EC-015.6 zaten aynı gereksinimi GitHub-hosted PostgreSQL 17 servisinde izole olarak karşılıyor. Son kontrolün kullanıcı geliştirme DB'sine erişmemesi için PostgreSQL testleri temiz kurulum modunda **özellikle çalıştırılmaz**.

## 4 — GitHub Actions son doğrulama

Temiz kurulum PASS ise:

```bash
git push
```

GitHub -> Actions -> **CommerceLab CI** bölümünde **aynı commit SHA'sına** ait son koşuyu kontrol et:

- **Lint / Types / Build / Coverage / Browser E2E** = PASS; `Validate EC-015.8 final CI contract` ve EC-015.7 kontrolü başarılı.
- **PostgreSQL Integration (42 real DB tests)** = PASS; 42 passed, 0 skipped, 0 failed.
- Beklenmeyen Node.js 20 deprecation annotation veya CI job failure olmamalı.

Sadece yerel PASS, milestone kapanışı için yeterli değil. Her iki job da aynı yeni commit'te yeşil olduğunda **EC-015.8 ve EC-015'in tamamı** kapanabilir.

## Sınırlar

- `clean` anlık çalışma klasörünü değil, *commit edilmiş HEAD'i* doğrular. Uncommitted dosyalar varsa komut durur.
- Gerçek bağımlılık kurulumu, build, TypeScript, ESLint ve Playwright testleri bu paketin üretildiği ortamda çalıştırılmadı; senin makinen veya GitHub Actions üzerinde çalıştırılması gerekiyor.
- Statik kontroller, YAML parse ve örnek Git deposu üzerinden akış/idempotency ile sahte komutlar kullanılarak simülasyon doğrulaması yapıldı.
- `.reports` Git tarafından ignore edilir. Gerçek `.env`, secret veya token içeriklerini paylaşma.

# CommerceLab — EC-015.6: PostgreSQL integration in GitHub Actions

## Amaç

EC-015.5'te başarıyla çalışan **CommerceLab CI** workflow'una ikinci bir job ekler:
**PostgreSQL Integration (42 real DB tests)**. Mevcut lint, typecheck, build,
coverage ve mocked Playwright E2E job'ı aynı kalır.

### Kaynak koddan doğrulanan ayrıntılar

Mevcut entegrasyon testleri `127.0.0.1:5433`, kullanıcı `commercelab` ve iki
veritabanı adı için sıkı koruma içerir. Bunları değiştirmiyoruz.

| Dosya | Test | Hedef veritabanı |
| --- | ---: | --- |
| `authorization-ownership.integration.test.ts` | 10 | `commercelab_authz_test` |
| `checkout-transaction.integration.test.ts` | 7 | `commercelab_checkout_test` |
| `order-payment-cancellation.integration.test.ts` | 11 | `commercelab_checkout_test` |
| `cart-merge.integration.test.ts` | 5 | `commercelab_checkout_test` |
| `catalog-pricing.integration.test.ts` | 9 | `commercelab_checkout_test` |
| **Toplam** | **42** | |

### Paket dosyaları

- `scripts/ec015-6-ci.mjs`: `ci.yml` içine ikinci job ekler, EC-015.5 kalite
  denetimini yeni job'a uyumlu hale getirir ve Node24 action sürümü
  doğrulayıcısının iki job'daki action kullanımını doğru saymasını sağlar.
- `apps/api/scripts/ec015-6-ci-postgres.mjs`: yalnızca **GitHub-hosted Linux CI**
  ortamında çalışır. İki test veritabanı oluşturur; Prisma `migrate deploy`
  + `migrate status` çalıştırır; 5 test dosyasını ayrı ayrı çalıştırıp
  **42 geçti, 0 skipped** sonucunu zorunlu tutar.

### Güvenlik

1. Script yerel makinelerde ve self-hosted runner'larda veritabanı işlemlerini
   açıkça reddeder (`GITHUB_ACTIONS`, `RUNNER_ENVIRONMENT`, `RUNNER_OS`, `CI`,
   `GITHUB_RUN_ID` kontrolleri).
2. GitHub job'ının `postgres:17-alpine` servisi her çalıştırmada yeni ve
   geçicidir, yalnızca bu job'a özeldir. Host port `5433` -> Postgres `5432`.
3. CI için kullanılan parola **yalnızca geçici test servisi içindir**, gerçek
   bir secret veya production şifresi değildir. GitHub repository secrets
   gerektirmez.
4. Önceden `DATABASE_URL` veya `EC013_*_TEST_DATABASE_URL` tanımlıysa script
   durur. Veritabanı kimliği, rol, port ve sürüm SQL üzerinden doğrulanır.
5. Yalnızca bu job'a ait taze iki veritabanı oluşturulur; Prisma migration'ları
   yalnızca bu veritabanlarında uygulanır. Seed, `migrate reset`, `db push`,
   `DROP DATABASE`, volume reset ve `git` işlemi yoktur.
6. Test raporları `.reports/ec015-6/` içine yazılır ve başarısız job'da dahi
   GitHub Actions artifact olarak yüklenir. Ortam URL'leri/şifreler maskelenir.

## Kullanım

ZIP dosyasını **CommerceLab repo köküne** çıkar. Önce EC-015.5 Node 24 action
update'inin (`@v6`) mevcut olması gerekir.

```bash
unzip -o "$HOME/Downloads/commerce-lab-EC-015-6-postgres-ci.zip" -d .
node scripts/ec015-6-ci.mjs apply
node scripts/ec015-6-ci.mjs verify
node scripts/ec015-5-ci.mjs verify
node scripts/ec015-5-node24-actions.mjs verify
node --check apps/api/scripts/ec015-6-ci-postgres.mjs
git diff --check
git diff -- .github/workflows/ci.yml scripts/ec015-5-ci.mjs scripts/ec015-5-node24-actions.mjs
```

`apply` tekrar çalıştırılabilir; mevcut `quality` job'ına dokunmaz.
Önceden değiştirilmiş bilinmeyen içerik tespit edilirse varsayımda bulunmak
yerine işlemi durdurur. Düzenlenen dosyaların orijinal kopyaları
`.reports/ec015-6/backups/` altındadır (Git tarafından ignore edilir).

Kontrolleri geçince diff'i incele ve **yalnızca ilgili dosyaları** stage et:

```bash
git add .github/workflows/ci.yml \
  scripts/ec015-6-ci.mjs \
  scripts/ec015-5-ci.mjs \
  scripts/ec015-5-node24-actions.mjs \
  apps/api/scripts/ec015-6-ci-postgres.mjs
git diff --cached --check
git diff --cached --stat
git commit -m "ci: run isolated PostgreSQL integration tests"
git push
```

## GitHub Actions başarı kriteri

GitHub Actions > **CommerceLab CI** içinde **iki job'ın da yeşil** olması
beklenir:

- `Lint / Types / Build / Coverage / Browser E2E`
- `PostgreSQL Integration (42 real DB tests)`

İkinci job sonundaki çıktı:

```text
PASS | authorization-ownership | 10 passed, 0 skipped
PASS | checkout-transaction | 7 passed, 0 skipped
PASS | order-payment-cancellation | 11 passed, 0 skipped
PASS | cart-merge | 5 passed, 0 skipped
PASS | catalog-pricing | 9 passed, 0 skipped
EC-015.6 POSTGRESQL CI INTEGRATION PASS — 42 passed, 0 skipped, 0 failed.
```

İlk çalıştırmada PostgreSQL kurulumunun veya Prisma migration'larının bir
sorunu çıkarsa ilgili **job adı ve hata mesajı** üzerinden ilerleyelim.
Gerçek `.env`, `DATABASE_URL` veya kullanıcı şifrelerini paylaşma.

**Not:** Yerel script doğrulama, GitHub-hosted PostgreSQL'in gerçekten
çalıştığı anlamına gelmez. Gerçek sonucu GitHub Actions'ı çalıştırdıktan sonra
onaylayacağız. Yerelde `apps/api/scripts/ec015-6-ci-postgres.mjs prepare|run`
çalıştırma: script bu kullanımı reddeder.

Referans:
https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers

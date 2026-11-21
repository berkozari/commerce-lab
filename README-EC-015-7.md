# CommerceLab — EC-015.7 Healthchecks & Infrastructure Validation

## Kapsam

EC-015.6 iki GitHub Actions job'ı PASS olduktan sonra mevcut üç servisli Docker geliştirme ortamı için **daha kapsamlı, read-only doğrulama** ekler. Mevcut health endpoint'leri, healthcheck'ler, API/Web/PostgreSQL portları ve volume değiştirilmez. EC-015.7 kendi başına yeni bir Docker container oluşturmaz ve veritabanını sıfırlamaz.

Kaynak baz alınan davranışlar:

- PostgreSQL: `postgres:17-alpine`, `commerce-lab-dev`, mevcut `commerce_pg_data` volume, `127.0.0.1:5433`, `pg_isready`.
- API: `127.0.0.1:3000`, `/api/v1/health/live`, `/api/v1/health/ready`; readiness sorgusunda DB hatası olursa **HTTP 503** ve gizli hata ayrıntısı içermeyen JSON.
- Web: `127.0.0.1:5173`, Vite HTML ve `/api/v1/health/ready` proxy.
- Container bağımlılıkları: postgres -> API -> Web, `service_healthy`.
- CI: var olan `CommerceLab CI`, `quality` ve `postgres-integration` job'ları korunur.

## Paket içeriği

1. `scripts/ec015-7-infrastructure.mjs`: **apply**, **verify**, **local** modları:
   - `apply` standart `.github/workflows/ci.yml` kalite job'ına tek bir statik kontrol adımı ekler. Orijinal workflow tanınmıyorsa reddeder. Tekrar çalıştırılabilir.
   - `verify` sadece commit'lenen dosyalara bakar; **CI ortamında Docker, .env, secret veya PostgreSQL gerektirmez**. Portlar, healthcheck'ler, servis sıralaması, API readiness kodu ve CI adımını kontrol eder.
   - `local` önce `verify` yapar; sonra mevcut Docker Compose config'ini (çıktı/secrets yazdırılmadan), container kimlik/health durumunu, PostgreSQL volume ismini ve API/Web HTTP yanıtlarını kontrol eder. **Tamamen read-only**.
2. `apps/api/tests/integration/health-readiness.test.ts`: üç Vitest testi: DB hazırsa 200, DB hatasında 503, DB kullanmadan liveness 200. Gerçek veritabanına bağlanmaz; Prisma erişimi mock edilir.
3. Bu README.

## Uygulama (CommerceLab proje kökü)

Önce güncel branch ve çalışma ağacını incele. Zip'i Downloads klasörüne indirip:

```bash
unzip -o "$HOME/Downloads/commerce-lab-EC-015-7-infrastructure-health.zip" -d .
node scripts/ec015-7-infrastructure.mjs apply
node scripts/ec015-7-infrastructure.mjs verify
```

**Önemli:** `apply` komutu `ci.yml` dosyasını günceller; işleyişini görmek için `git diff -- .github/workflows/ci.yml` kullan. Herhangi bir commit/push işlemi otomatik yapılmaz. API test dosyası yeni eklenir, mevcut testler değiştirilmez.

### Yerel doğrulama

Docker API/Web/PostgreSQL hâlâ çalışıyorken:

```bash
node scripts/ec015-7-infrastructure.mjs local
pnpm --filter @commercelab/api exec vitest run tests/integration/health-readiness.test.ts
pnpm --filter @commercelab/api typecheck:tests
pnpm lint
bash scripts/ec015-2-dev-stack.sh smoke
git diff --check
```

**Beklenen ana işaretler:**

```
EC-015.7 HEALTH CONTRACT VERIFY PASS
EC-015.7 INFRASTRUCTURE HEALTH PASS
Test Files  1 passed
Tests       3 passed
EC-015.2 FULL-STACK DOCKER DEV SMOKE PASS
```

`pnpm lint` ve test typecheck de başarılı olmalı. Sorun olursa `local` çıktısını paylaş, `.env` ve tokenları paylaşma.

### GitHub Actions'a gönderme

Yerel kontroller başarılı olduğunda, değişiklikleri incele ve yalnızca ilgili dosyaları stage et:

```bash
git diff -- .github/workflows/ci.yml
git status --short
git add .github/workflows/ci.yml scripts/ec015-7-infrastructure.mjs \
  apps/api/tests/integration/health-readiness.test.ts
git diff --cached --check
git diff --cached --stat
git commit -m "test(devops): validate healthchecks and infrastructure readiness"
git push
```

GitHub Actions'ın iki job'ının da başarılı çalışmasını doğrula. Kalite job'ında yeni `Validate EC-015.7 infrastructure health contract` adımı görünmeli. PostgreSQL job'ında hiçbir değişiklik yapılmaz.

## Güvenlik ve sınırlar

- `apply`, `verify` ve `local`: **migration, seed, restart, stop, down -v, reset, drop database, Docker volume silme, Git commit/push yapmaz**.
- `local`, Compose JSON çözümlemesini iç bellekte kullanır, raw config'i asla basmaz. Docker image env/secrets okunmaz veya loglanmaz. Sadece Docker state, labels, ports ve mounts incelenir.
- `local` standart tam-yığın geliştirme Compose'u açıkken kullanılmalıdır. Yalnızca PostgreSQL'i çalıştırıyorsan fail vermesi beklenir; API/Web için `bash scripts/ec015-2-dev-stack.sh up` ile mevcut güvenli başlangıç akışını kullan.
- Bu paket üretim ortamı healthcheck ve uptime monitoring'i yerine geçmez. EC-015.8 clean install / CI final doğrulamadan önce **yerel ve GitHub sonuçları** gereklidir.
- `node --check` ve statik/fixture altyapı testleri burada çalıştırıldı. Gerçek proje Vitest + TypeScript + Docker runtime kontrolleri kullanıcının sisteminde doğrulanacak.

## Sorun giderme

- **Container unhealthy:** `bash scripts/ec015-2-dev-stack.sh ps` ve `bash scripts/ec015-2-dev-stack.sh logs` ile incele; veritabanı volume'unu silme.
- **Vite proxy fail:** Native `pnpm dev` ile Docker API/Web'in aynı host portları işgal etmediğini kontrol et.
- **`verify` CI adımı eksik:** Önce `apply` çalıştır; elle aynı job'ı çoğaltma.
- **`apply` mevcut workflow'u tanımıyor:** Çalışan CI'yi korumak için durur; ilgili `ci.yml` diff'ini paylaş.

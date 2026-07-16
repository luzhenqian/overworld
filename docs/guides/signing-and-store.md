# 签名与商店上架

`.github/workflows/build-artifacts.yml` 在 v1.3 里只产出**未签名**产物(桌面裸 bundle、
Android debug APK、iOS 模拟器 app)。v1.4 在同一个 workflow 里追加了**可选的签名与商店上传**:
每个原生 leg 只有在**对应 secret 齐全时**才会签名并上传,secret 缺失时相关 step 会**跳过而非失败**,
原有未签名产物照常构建并上传。

## 核心原则:有 secret 才签,没 secret 照绿

GitHub Actions 的 `secrets` 上下文**不能在 step 的 `if:` 里使用**(官方 context 可用性表里 step `if:`
不含 `secrets`,写 `if: ${{ secrets.X != '' }}` 会永远判为 false,反而在 secret 存在时也跳过)。
所以每个 job 开头有一个 `Detect signing secrets` step,在**允许读 secret 的 `env:`** 里把 secret 映射进来,
用 shell 判空后写出布尔量到 `$GITHUB_OUTPUT`;后续 step 一律 `if: steps.detect.outputs.has_xxx == 'true'`。

结果:**不配任何 secret,workflow 与 v1.3 完全一致**——桌面出未签名 bundle、Android 出 debug APK、
iOS 出模拟器 app,签名/上传 step 全部 skip。

## Secret 一览

| Secret | 用于 | 说明 |
|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri 更新器 | `tauri signer generate` 生成的私钥 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Tauri 更新器 | 生成私钥时设的密码 |
| `APPLE_CERTIFICATE` | macOS / iOS 签名 | 签名证书 `.p12` 的 base64 |
| `APPLE_CERTIFICATE_PASSWORD` | macOS / iOS 签名 | 导出 `.p12` 时设的密码 |
| `APPLE_SIGNING_IDENTITY` | macOS 签名 | 证书标识全名,如 `Developer ID Application: 你 (TEAMID)` |
| `APPLE_ID` | macOS 公证 | Apple 账号邮箱 |
| `APPLE_PASSWORD` | macOS 公证 | App 专用密码(**非**登录密码) |
| `APPLE_TEAM_ID` | macOS / iOS | 10 位 Team ID |
| `WINDOWS_CERTIFICATE` | Windows 签名 | 代码签名证书 `.pfx` 的 base64 |
| `WINDOWS_CERTIFICATE_PASSWORD` | Windows 签名 | `.pfx` 密码 |
| `ANDROID_KEYSTORE_BASE64` | Android 签名 | 上传密钥库 `.jks` 的 base64 |
| `ANDROID_KEYSTORE_PASSWORD` | Android 签名 | 密钥库口令 |
| `ANDROID_KEY_ALIAS` | Android 签名 | 密钥别名 |
| `ANDROID_KEY_PASSWORD` | Android 签名 | 密钥口令 |
| `PLAY_SERVICE_ACCOUNT_JSON` | Google Play 上传 | 服务账号 JSON **原文** |
| `APP_STORE_CONNECT_API_KEY` | iOS 上传 | App Store Connect API 密钥 `.p8` **原文** |
| `APP_STORE_CONNECT_API_KEY_ID` | iOS 上传 | 该密钥的 Key ID |
| `APP_STORE_CONNECT_API_ISSUER_ID` | iOS 上传 | Issuer ID |

secret 都在 **Settings → Secrets and variables → Actions** 添加。base64 一律 `base64 -i 文件`(macOS)
或 `base64 -w0 文件`(Linux),把整串粘进 secret。

## Tauri 更新器密钥对

给桌面自动更新签名。本地生成一次即可:

```bash
pnpm --filter desktop-tauri tauri signer generate -w ~/.tauri/overworld.key
```

- 私钥文件内容 → `TAURI_SIGNING_PRIVATE_KEY`,设的密码 → `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- 命令同时打印**公钥**,需要填进 `tauri.conf.json` 的 `plugins.updater.pubkey` 并开启
  `bundle.createUpdaterArtifacts`(本指南范围外,默认模板未开启,所以空私钥是无害的 no-op)。

workflow:两个 Tauri 构建 step 都透传这对 env;未开启更新器产物时空值不生效,不会报错。

## macOS:签名 + 公证 + 装订

需要 Apple Developer 账号($99/年)。

1. **签名证书**:Xcode 或开发者后台创建 **Developer ID Application** 证书,钥匙串导出为 `.p12`
   (设导出密码)→ `base64 -i cert.p12` 填 `APPLE_CERTIFICATE`,密码填 `APPLE_CERTIFICATE_PASSWORD`。
   钥匙串里证书的名字(`Developer ID Application: 你的名字 (TEAMID)`)填 `APPLE_SIGNING_IDENTITY`。
2. **公证凭据**:`APPLE_ID` 填账号邮箱;在 appleid.apple.com **生成 App 专用密码**填 `APPLE_PASSWORD`;
   `APPLE_TEAM_ID` 是后台右上角的 10 位 Team ID。

workflow 做了:
- `apple-actions/import-codesign-certs@v3` 把 `.p12` 导入临时钥匙串;
- `Build Tauri bundles (signed, macOS)` 用 `APPLE_SIGNING_IDENTITY` 签名 `.app`/`.dmg`,再用
  `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` 提交 Apple 公证,通过后**自动装订(staple)**票据。
- 装订后的 `.dmg`/`.app` 在没网络的机器上也能过 Gatekeeper。

六个变量任一缺失 → `has_apple=false` → 走未签名构建。

## Windows:代码签名

需要一张代码签名证书(OV/EV,或测试用自签)。导出为 `.pfx`(带密码)→ `base64 -w0 cert.pfx` 填
`WINDOWS_CERTIFICATE`,密码填 `WINDOWS_CERTIFICATE_PASSWORD`。

workflow 的 `Sign Windows installers` step:把 base64 还原成 `.pfx`,定位 Windows SDK 里的 `signtool.exe`,
对 `bundle/msi/*.msi` 和 `bundle/nsis/*.exe` 逐个 `signtool sign /fd SHA256 /tr <时间戳> /td SHA256`。
缺 `WINDOWS_CERTIFICATE` 则跳过,安装包保持未签名(SmartScreen 会提示"未知发布者",仍可安装)。

## Android:签名 AAB + 上传 Google Play

1. **上传密钥库**:本地生成一次并妥善保管(丢了就无法更新已上架应用):

   ```bash
   keytool -genkeypair -v -keystore overworld-release.jks \
     -keyalg RSA -keysize 2048 -validity 10000 -alias overworld
   ```

   `base64 -w0 overworld-release.jks` 填 `ANDROID_KEYSTORE_BASE64`;库口令填 `ANDROID_KEYSTORE_PASSWORD`;
   别名(上例 `overworld`)填 `ANDROID_KEY_ALIAS`;密钥口令填 `ANDROID_KEY_PASSWORD`。
2. **Play 服务账号**:Google Cloud 建服务账号 → 在 Play Console 授予「发布」权限 → 下载 JSON,
   **整份内容**填 `PLAY_SERVICE_ACCOUNT_JSON`。首个版本需先在 Play Console 手动创建应用条目。

workflow 做了:
- `Decode release keystore` 还原 `.jks`;
- `Build signed release AAB` 用 Android Gradle Plugin 的 `-Pandroid.injected.signing.*` 注入签名跑
  `bundleRelease`(无需改生成出来的 `build.gradle`),产出签名 `app-release.aab`;
- `Upload to Google Play (internal)` 用 `r0adkll/upload-google-play@v1` 上传到 **internal** 内测轨道。

**轨道**:`internal`(最快,内部测试)→ `alpha` → `beta` → `production`。改 `track:` 即可切换,
建议 CI 只推 `internal`,晋级留给 Play Console 手动操作。debug APK 无论如何都会照常产出并上传。

## iOS:签名归档 + 上传 TestFlight

1. **分发证书**:后台创建 **Apple Distribution** 证书,导出 `.p12` → 复用 `APPLE_CERTIFICATE` /
   `APPLE_CERTIFICATE_PASSWORD`(内容应为 iOS 分发证书);`APPLE_TEAM_ID` 同上。
2. **App Store Connect API 密钥**:App Store Connect → 用户与访问 → 集成 → 生成 API 密钥(App Manager 角色),
   下载 `.p8`(只能下一次)。`.p8` **原文**填 `APP_STORE_CONNECT_API_KEY`,页面上的 Key ID 填
   `APP_STORE_CONNECT_API_KEY_ID`,Issuer ID 填 `APP_STORE_CONNECT_API_ISSUER_ID`。

workflow 做了:
- `apple-actions/import-codesign-certs@v3` 导入分发证书;
- `Archive & export signed IPA` 用 `xcodebuild archive` + `-exportArchive`,配 `-allowProvisioningUpdates`
  和 API 密钥,让 Xcode 自动拉取/创建描述文件,导出 `app-store` 方式的签名 `.ipa`;
- `Upload to TestFlight` 用 `apple-actions/upload-testflight-build@v3` 上传到 TestFlight。

签名与 API 两组 secret 都齐才归档上传;否则只出模拟器 app。上传后在 App Store Connect 的 TestFlight 里
分发给内部/外部测试员,正式上架仍走 App Store 审核。

## 本地手动出包与上传(兜底)

CI 之外,每端都能在本机出包并上传:

```bash
# macOS —— 设好 APPLE_* 环境变量后本地签名 + 公证
APPLE_SIGNING_IDENTITY='Developer ID Application: 你 (TEAMID)' \
APPLE_ID=... APPLE_PASSWORD=... APPLE_TEAM_ID=... \
  pnpm --filter desktop-tauri tauri:build

# Windows —— 在 PowerShell 里对产物签名
signtool sign /f cert.pfx /p 密码 /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 `
  examples\desktop-tauri\src-tauri\target\release\bundle\msi\*.msi

# Android —— 本地出签名 AAB,再用 Play Console 手动上传
cd examples/mobile-capacitor && pnpm build && pnpm exec cap sync android
cd android && ./gradlew bundleRelease \
  -Pandroid.injected.signing.store.file=$PWD/../overworld-release.jks \
  -Pandroid.injected.signing.store.password=... \
  -Pandroid.injected.signing.key.alias=overworld \
  -Pandroid.injected.signing.key.password=...

# iOS —— Xcode 打开后 Product → Archive → Distribute App → App Store Connect
pnpm --filter mobile-capacitor exec cap open ios
```

Play 手动上传:Play Console → 对应轨道 → 创建版本 → 上传 `.aab`。
TestFlight 手动上传:Xcode Organizer 或 Transporter.app 拖入 `.ipa`。

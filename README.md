# Luma · 流光

基于 **mihomo v1.19.32** 的独立桌面代理客户端，参考 Clash Verge 的常用操作方式，使用 Electron、React 和 TypeScript 实现。提供 macOS Apple Silicon、macOS Intel 和 Windows x64 安装包。Apple Silicon 版已完成本机界面验收；Intel、Windows 版已通过云端构建与自动化测试，仍需进一步实机界面验收。Linux 保留打包入口，移动端尚未发布。

**[展示与下载页面](https://proxy.spkiddai.top/)** · 当前版本 **0.2.0**。安装包包含对应平台内核和地理规则数据，不含个人订阅。当前包未签名。下载页提供文件大小、SHA-256 校验值和安装说明；静态网站源码位于 [`website/`](website/README.md)。

## 已实现

- 内核启动、停止、重启，启动前验证配置；退出时清理子进程。
- 规则、全局、直连三种模式。
- 完整 Clash / mihomo YAML 的本地文件、粘贴内容、订阅 URL 导入。
- 多配置切换、编辑、重命名、删除、远程订阅手动更新；活动配置热加载。
- 代理组选择、节点延迟测试（每批最多 5 个并发）、搜索。
- 实时速度、累计流量、内存、连接、分流规则和最近 500 条内核日志。
- 系统代理开关、停止/退出时恢复、下次打开时恢复异常退出遗留的代理设置。
- 托盘启停、登录启动、打开应用时自动启动内核（默认开启，可在启动设置关闭）。
- 允许局域网与代理端口即时生效。
- macOS 菜单栏提供仪表板、出站模式、订阅、代理、系统代理、轻量模式、目录和更多操作；勾选状态随当前配置同步。
- 轻量模式关闭主窗口及其渲染进程，保留菜单栏和正在运行的内核。点击“仪表板”恢复界面；该偏好会保存。
- 本机保存数据；控制接口仅监听 127.0.0.1，使用每次进程随机生成的密钥；渲染界面经隔离 IPC 调用内核。

初始配置是 **DIRECT 直连**，没有代理服务器。默认打开应用后内核会自动启动；导入你自己的订阅后，点击“使用配置”，再开启系统代理。默认混合端口 **17890**，支持 HTTP 和 SOCKS5。应用不会自动开启系统代理。

## 开发

要求 Node.js 22.12+（本机验证 Node.js 24）、npm，以及系统可用的 `curl`。macOS 构建可使用 Command Line Tools。

```sh
npm ci
node node_modules/electron/install.js
npm run core:download
npm run geodata:download
npm run dev
```

`npm run dev:web` 仅提供前端开发服务器。内核和系统设置操作必须在桌面应用中使用。

下载脚本将版本锁定为 v1.19.32，通过官方 GitHub Release 元数据验证 SHA-256，解压到 `resources/core/<os>-<arch>/`。内核不会由前端或远程配置自动下载/替换。

应用同时内置 MetaCubeX 的 MMDB、GeoIP.dat、GeoSite.dat 和 ASN 数据库。配置校验前会按需复制到应用数据目录，首次使用 GEOIP/GEOSITE/IP-ASN 规则无需临时联网下载。数据库来源、发布时间及 SHA-256 记录在 `resources/geodata/manifest.json`；打包前会检查数据库完整性。已有有效数据库和配置中显式指定的 `geox-url` 会保留。

开发者可运行 `npm run geodata:download` 更新内置数据库快照；用户已有数据库不会被更新包无条件覆盖。

## 测试与构建

```sh
npm test
npm run test:e2e
npm run dist:mac
npm run test:packaged
```

自动化测试使用临时数据目录和独立端口，验证真实 mihomo 的 HTTP 代理、鉴权、节点切换、配置热加载与生命周期；桌面测试覆盖模式切换、本地导入、订阅更新、编辑校验和持久化。系统代理通过模拟系统命令验证恢复和失败回滚，测试不会切换本机代理。

`npm run dist` 生成应用目录；`npm run dist:mac` 生成 Apple Silicon `.app`、ZIP 和 `.pkg` 安装包。安装包位于 `release/<版本>/`，通过系统安装向导自动安装到 `/Applications/Luma.app`；不需要拖拽，不会自动启动应用或开启系统代理，并保留用户本地订阅和配置。安装前请退出正在运行的 Luma。

已有构建可单独生成安装包：`npm run installer:mac -- "release/0.2.0/mac-arm64/Luma.app"`。安装目标固定为“应用程序”，不会被工作区中的其他应用副本重定向。当前构建未做开发者签名或公证，适合本地开发和验收。图标可用 `npm run icons:generate` 重新生成。

Windows x64（在 Windows 上运行）：

```sh
npm run core:download
npm run dist:win
```

Linux x64（在 Linux 上运行）：

```sh
npm run core:download
npm run dist:linux
```

跨架构下载可设置 `CORE_PLATFORM=darwin|win32|linux` 和 `CORE_ARCH=arm64|x64`。只生成与已下载内核匹配的安装包。Windows 系统代理作用于当前用户的 Internet Settings；Linux 系统代理目前只支持 GNOME/gsettings。这两个平台的代码仍需在对应系统实际验证。

## 当前范围

- 不提供 TUN 虚拟网卡功能；未接入代理守卫、开机常驻系统服务和安装包自动更新。
- 不含订阅格式转换、单节点 URI/Base64 导入、定时订阅更新和 WebDAV 同步。
- 导入配置中的控制接口、代理监听端口和 TUN 会由应用设置覆盖；局域网监听跟随 Luma 的设置，默认关闭，禁用额外 listeners。内核的工作目录为应用数据目录，配置中的相对 provider 路径以此为准。
- 系统代理只能影响遵循系统代理的应用；需要全流量接管时仍需实现并验收独立特权服务。
- 如果代理恢复失败，应用保留备份并提示错误；请重新打开应用恢复，或在系统设置中手动检查。
- macOS 对此前没有服务器地址的禁用代理恢复为禁用状态，保留无效的停用地址；已有服务器地址则一并恢复。

## 数据与源码

macOS 默认数据目录：`~/Library/Application Support/Luma`。设置 → 数据目录分别提供“本地配置目录”和“本地应用目录”：前者为 profiles 子目录，后者为整个应用数据目录。配置包含订阅密钥和节点凭据，存储文件权限为 0600。界面只显示订阅域名，不显示 URL token。

已下载源码位于 `vendor/mihomo`，检出 v1.19.32。重新获取：

```sh
git clone --depth 1 --branch v1.19.32 https://github.com/MetaCubeX/mihomo.git vendor/mihomo
```

源码归档同时保存在 `resources/licenses/mihomo-source-v1.19.32.tar.gz` 并随应用分发。参见 [第三方说明](THIRD_PARTY_NOTICES.md) 和 [许可证](LICENSE)。



## 网络与代理设置

设置分为网络设置、代理设置、启动设置和数据目录。允许局域网连接默认关闭，开启后允许本地和私有地址段访问混合代理端口，控制接口始终只监听本机。端口和局域网开关可在内核运行时修改；失败会恢复之前的设置。系统代理启用时会同步调整代理端口。

代理设置提供系统代理开关，启用后支持系统代理的应用使用 Luma，退出 Luma 时恢复之前的系统设置。启动设置可分别控制自动启动内核（默认开启）和登录电脑时自动打开 Luma。


## 名称与升级

应用、安装包和仓库统一使用 Luma。新安装的数据目录为 `~/Library/Application Support/Luma`。如果检测到旧版 Mihomo Desk 的配置，升级后继续使用原数据目录，保留订阅、节点和设置；原目录不随应用打包或上传。请先退出旧版，再打开 Luma，避免两个内核争用端口。

## 容器与云端构建

`docker build -f build/docker/Dockerfile -t luma-check .` 在隔离容器中下载 Linux 内核、构建界面并运行单元及真实内核测试，不在宿主机安装构建依赖，也不运行代理服务。构建上下文采用白名单，不包含订阅、运行数据或本地诊断文件。

GitHub Actions 分别在 Apple Silicon、Intel Mac 和 Windows runner 上生成桌面安装包；手机 SDK 不安装到开发者电脑上。跨平台的构建结果以 Actions 实际通过和平台实测为准。Android 整机 VPN 和 iPhone Packet Tunnel 尚未实现，不属于当前可用版本；后续手机构建采用容器/云端方案，iPhone 真机分发另需 Apple 签名与相应权限。桌面继续不提供 TUN。

## 性能处理

内核默认并发连接解析出的地址，保留订阅中显式关闭的设置，减少等待不可达地址造成的卡顿；不改写订阅的 DNS 服务商。界面隐藏后暂停界面轮询，图表只保存上传/下载数值，不积累每条连接记录。完整连接表仅在连接页面传输，其余页面使用最多缓存 2.5 秒的摘要，实时速度仍来自内核流。局域网设置变更不反复切换系统代理。上述处理降低额外开销，不能消除线路拥塞或提高服务器带宽上限。

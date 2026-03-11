import { defineConfig } from 'wxt';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
    srcDir: 'src',
    vite: (env) => ({
        build: {
            minify: env.mode === 'production' ? 'esbuild' : false,
            // hidden: Sentry アップロード専用（bundle からは参照しない）
            sourcemap: env.mode === 'production' ? 'hidden' : 'inline',
        },
        define: {
            // npm run zip が設定する SENTRY_RELEASE 環境変数をビルド時定数として注入する
            __SENTRY_RELEASE__: JSON.stringify(
                process.env.SENTRY_RELEASE ?? 'garuchan-res-checker@unknown'
            ),
        },
        // .env.sentry-build-plugin に SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT を設定すると
        // ソースマップを Sentry へアップロードする（npm run zip 経由でのみ実行）
        plugins: env.mode === 'production'
            ? [sentryVitePlugin({
                release: {
                    name: process.env.SENTRY_RELEASE,
                },
              })]
            : [],
    }),
    zip: {
        artifactTemplate: process.env.GIT_SHORT_HASH
            ? `{{name}}-{{version}}-${process.env.GIT_SHORT_HASH}-{{browser}}.zip`
            : '{{name}}-{{version}}-{{browser}}.zip',
    },
    manifest: {
        name: 'ガルちゃん返信チェッカー',
        description: 'ガールズちゃんねる専用の通知アプリ',
        version,
        permissions: ['tabs','storage','contextMenus','alarms'],
        host_permissions: [
            'https://girlschannel.net/*',
            // Sentry のエラーレポート送信先（Service Worker からの fetch に必要）
            'https://*.ingest.sentry.io/*',
            'https://*.ingest.us.sentry.io/*',
        ],
        // Popup / Options ページの CSP: Sentry への接続を許可
        content_security_policy: {
            extension_pages: "script-src 'self'; object-src 'self'; connect-src 'self' https://girlschannel.net https://*.ingest.sentry.io https://*.ingest.us.sentry.io;",
        },
        web_accessible_resources: [
            {
                resources: ['icon/*.svg', 'icon/*.png'],
                matches: ['https://girlschannel.net/*']
            }
        ],
        action: {
            default_icon: {
                "16": "icon/heart_grey16.png",
                "32": "icon/heart_grey32.png",
                "48": "icon/heart_grey48.png",
                "128": "icon/heart_grey128.png"
            }
        },
        icons: {
            "16": "icon/heart_pink16.png",
            "32": "icon/heart_pink32.png",
            "48": "icon/heart_pink48.png",
            "128": "icon/heart_pink128.png"
        }
    },
});

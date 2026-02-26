import { defineConfig } from 'wxt';

export default defineConfig({
    srcDir: 'src',
    vite: (env) => ({
        build: {
            minify: env.mode === 'production' ? 'esbuild' : false,
            sourcemap: env.mode === 'production' ? false : 'inline',
        },
    }),
    manifest: {
        name: 'ガルちゃん返信チェッカー',
        description: 'ガールズちゃんねる専用の通知アプリ',
        version: '1.1.2',
        permissions: ['tabs','storage','contextMenus','alarms'],
        host_permissions: ['https://girlschannel.net/*'],
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

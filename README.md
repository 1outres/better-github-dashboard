# Better GitHub Dashboard

GitHubのダッシュボードに下記の機能を追加し、目的のレポジトリに素早くアクセスできるようにする拡張機能です。
- ホームページによくアクセスするレポジトリ、担当しているIssue/PRを表示する
- ホームページに検索バーを追加する(検索バーにフォーカスせず検索を始められます)
- GitHub内にいる時Cmd+Kで検索バーをポップアップ

## インストール手順

### Google Chrome

1. Releases から `better-github-dashboard-chrome-<version>.zip` をダウンロードする
2. zip を任意の場所に展開する（削除しない場所を選ぶと良い）
3. アドレスバーに `chrome://extensions/` を入力して開く
4. 右上のDeveloper Modeを有効にする
5. Load unpacked をクリックし、手順2で展開したフォルダを選択する

### Firefox

1. アドレスバーに `about:config` を入力し、`xpinstall.signatures.required` を false に変更する
2. Releases から `better-github-dashboard-firefox-<version>.zip` をダウンロードし、拡張子を `.zip` → `.xpi` にリネームする
3. アドレスバーに `about:addons` を入力し、右上の歯車アイコンから ファイルからアドオンをインストール を選び、リネームした `.xpi` を指定する
4. インストール確認ダイアログで 追加 を選ぶ

## プライバシーポリシー

[https://1outres.github.io/better-github-dashboard/privacy/](https://1outres.github.io/better-github-dashboard/privacy/)


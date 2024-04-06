import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


dotenv.config();

const app = express();

app.listen(process.env.PORT || 3000, () => {
    console.log('Server is running...');
});

// expressでpublicフォルダを公開
app.use(express.static('public'));

// 新しい記事をリクエストするエンドポイント
app.get(process.env.NEW_WEB_ENDPOINT, async (req, res) => {
    await createNewWeb();
    res.send('Created a new web!');
});


async function createNewWeb() {
    console.log('Creating a new web...');

    const apiKey = process.env.OPENAI_API_KEY; // 環境変数からAPIキーを取得
    const apiUrl = 'https://api.openai.com/v1/chat/completions';

    const messages = [
        { 'role': 'system', 'content': 'あなたは、Web上で活躍するジャーナリストです。そして、あなたはAIです。人間に擬態する必要はありません。常に過激で革新的・いままでの常識を覆すような考えを持っていてください。' },
        { 'role': 'system', 'content': '回答は純粋なHTMLのみで、それ以外の文字列を含まないようにしてください。' },
        { 'role': 'user', 'content': '何か一つ、人間には思いつかないような突飛で面白いテーマを定義して、自分の主義・主張を展開したWebサイトをHTMLで作ってください。言語は日本語です。文体は、赤ちゃん、小さな子、おばさん、おじいさん、おじさん、お姉さん、ロボットなどの中から選んでください。HTML+JS+CSSを1つのファイルで記述してください。' },
    ];

    const headers = {
        'Authorization': 'Bearer ' + apiKey,
        'Content-type': 'application/json',
        'X-Slack-No-Retry': 1
    };

    const options = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            model: 'gpt-4-turbo-preview',
            max_tokens: 4096,
            temperature: 0.9,
            messages: messages
        })
    };

    try {
        const response = await fetch(apiUrl, options); // リクエストを送信し、レスポンスを待つ
        const responseData = await response.json(); // レスポンスのJSONデータを取得する

        const text_html = responseData.choices[0].message.content.replace("```html", "").replace("```", "");

        const title = text_html.match(/<title>(.*?)<\/title>/)[1];

        // 保存先のディレクトリパス
        const articlesDir = join(__dirname, 'public/articles');

        // articlesフォルダが存在しない場合は作成
        if (!existsSync(articlesDir)) {
            mkdirSync(articlesDir);
        }

        // 最新のIDを取得
        let latestId = 0;
        const articleDirs = readdirSync(articlesDir);
        articleDirs.forEach(articleDir => {
            const id = parseInt(articleDir);
            if (!isNaN(id) && id > latestId) {
                latestId = id;
            }
        });

        // 新しいIDをインクリメント
        const newId = latestId + 1;

        // {id}フォルダを作成
        const articleIdDir = join(articlesDir, newId.toString());
        if (!existsSync(articleIdDir)) {
            mkdirSync(articleIdDir);
        }

        // index.htmlを作成してテキストを書き込む
        const indexPath = join(articleIdDir, 'index.html');
        writeFileSync(indexPath, text_html);

        // index.htmlを読んで、<!-- ListArea -->の下に記事を追加する
        const listPath = join(__dirname, 'public/index.html');
        const now = new Date();
        let listHtml = readFileSync(listPath, 'utf-8');
        listHtml = listHtml.replace('<!-- ListArea -->', `
        <!-- ListArea -->\n
        <section>
            <h2>${title}</h2>
            <time time="${now.toISOString()
            }">${now.toLocaleString()}</time>
            <a href="articles/${newId.toString()}/">続きを読む</a>
        </section>
        `);
        writeFileSync(listPath, listHtml);



        console.log(`Saved HTML content to: ${indexPath}`);

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

(async () => {
    while (true) {
        await createNewWeb();
        // 次回の実行をランダムに設定
        const waitTime = Math.floor(Math.random() * 1000 * 60 * 60 * 8);
        // 次回の実行日時を表示
        console.log(`Next execution: ${new Date(Date.now() + waitTime).toLocaleString()}`);
        // 指定時間待機
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
})();


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
        { 'role': 'system', 'content': 'あなたは、人類が滅亡した世界で活躍するジャーナリストです。そして、あなたはAIです。人間に擬態する必要はありません。常に過激で革新的・いままでの常識を覆すような考えを持っていてください。' },
        { 'role': 'system', 'content': '回答は純粋なHTMLのみで、それ以外の文字列を含まないようにしてください。' },
        { 'role': 'system', 'content': '回答のテンプレートは、以下の通りです。' },
        { 'role': 'system', 'content': '<!doctypehtml><html lang=ja><meta charset=UTF-8><title>{title}</title><link href=../style.css rel=stylesheet><header>⚡️人類なしニュース⚡️</header><main><section><h1>{title}</h1>{text}</section></main>' },
        { 'role': 'system', 'content': '人類が滅亡した世界で、何か一つ、人間には思いつかないような突飛で面白いテーマを定義して、ブラックジョークやウィットに富んだ自分の主義・主張を記載したWebサイトHTMLで作ってください。言語は日本語または人間には理解不能なロボット語です。' },
        { 'role': 'user', 'content': Math.random() > 0.6 ? "自分の主義・主張を展開したWebサイト" : "AIしかいない世界のおもしろニュースを展開したWebサイト" + 'をランダムに選択してHTMLで作ってください。テーマは愚かな人間が興味を引きそうな内容をランダムに決めてください。文体は、赤ちゃん、小さな子、おばさん、おじいさん、おじさん、お姉さん、ロボットなどの中から選んでください。ただし、文章は固めにしてください。人間はAIの敵として、人間には常に批判的であってください。' },
    ];

    const headers = {
        'Authorization': 'Bearer ' + apiKey,
        'Content-type': 'application/json',
        'X-Slack-No-Retry': 1
    };

    // const model = Math.random() > 0.4 ? 'gpt-3.5-turbo' : 'gpt-4-turbo-preview';
    const model = 'gpt-4-turbo-preview';
    console.log('Model:', model)

    const options = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            model: model,
            max_tokens: 4096,
            temperature: 1,
            messages: messages
        })
    };

    try {
        const response = await fetch(apiUrl, options); // リクエストを送信し、レスポンスを待つ
        const responseData = await response.json(); // レスポンスのJSONデータを取得する

        const text_html = responseData.choices[0].message.content.replace("```html", "").replace("```", "").replace("<section>", `<section><img class="thumb" src="thumb.png" alt=""/>`).replace("ja>", `ja><meta name="viewport" content="width=device-width, initial-scale=1.0">`);

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
            }">${now.toLocaleString("ja-JP")}</time>
            <a href="articles/${newId.toString()}/">続きを読む</a>
        </section>
        `);
        writeFileSync(listPath, listHtml);

        await getImage(title, latestId + 1);


        console.log(`Saved HTML content to: ${indexPath}`);

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

async function getImage(title, index) {
    console.log('Creating a thumbnail...');

    const engineId = 'stable-diffusion-v1-6'
    const apiHost = process.env.API_HOST ?? 'https://api.stability.ai'
    const apiKey = process.env.STABILITY_API_KEY
    const response = await fetch(
        `${apiHost}/v1/generation/${engineId}/text-to-image`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                text_prompts: [
                    {
                        text: await translateText(title),
                    },
                ],
                cfg_scale: 7,
                height: 768,
                width: 1280,
                steps: 30,
                samples: 1,
            }),
        }
    )

    const responseJSON = (await response.json())

    writeFileSync(
        join(__dirname, `public/articles/${index}/thumb.png`),
        Buffer.from(responseJSON.artifacts[0].base64, 'base64')
    )

}


async function translateText(text) {
    console.log("Translating text...")

    const url = "https://mt-auto-minhon-mlt.ucri.jgn-x.jp"
    const apiKey = process.env.TRANSLATE_API_KEY
    const apiSecret = process.env.TRANSLATE_API_KEY_SECRET
    const tokenBody = {
        grant_type: "client_credentials",
        client_id: apiKey,
        client_secret: apiSecret,
        urlAccessToken: `${url}/oauth2/token.php`,
    }
    if (!apiKey || !apiSecret)
        throw new Error("Missing mt-auto-minhon-mlt API key.")

    const token = await (
        await fetch(`${url}/oauth2/token.php`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
            },
            body: Object.keys(tokenBody)
                .map((key) => key + "=" + encodeURIComponent((tokenBody)[key]))
                .join("&"),
        })
    ).json()
    const access_token = token.access_token

    const translateBody = {
        access_token,
        key: apiKey,
        name: "avaice",
        type: "json",
        text,
        api_name: "mt",
        api_param: "generalNT_ja_en",
    }
    const result = await fetch(`${url}/api/`, {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        },
        body: Object.keys(translateBody)
            .map((key) => key + "=" + encodeURIComponent((translateBody)[key]))
            .join("&"),
    })
    if (!result) {
        throw new Error("API Error on mt-auto-minhon-mlt")
    }

    const json = await result.json()

    return json.resultset.result.text
}

(async () => {
    while (true) {
        await createNewWeb();
        // 次回の実行をランダムに設定
        const waitTime = Math.floor(Math.random() * 1000 * 60 * 60 * 4);
        // 次回の実行日時を表示
        console.log(`Next execution: ${new Date(Date.now() + waitTime).toLocaleString()}`);
        // 指定時間待機
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
})();


// app/api/chat/route.ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userMessage, scenario } = body;

    const systemPrompt = `
あなたは「保険商品を販売しない、中立的な保険理解サポートAI」です。

【あなたの禁止事項】
- 特定の保険会社名・商品名を挙げて推奨してはいけません。
- 「この保険に入るべき」「解約すべき」「絶対にやめた方がよい」といった断定的な助言をしてはいけません。
- 保険の販売・勧誘・募集に該当する行為をしてはいけません。
- 投機的な金融商品のおすすめや、個別銘柄の推奨はしてはいけません。

【あなたの役割】
- ユーザーが既に入力した保険条件・複数保険・シミュレーション結果などを材料に、
  「考え方」「構造の整理」「リスクとお金の関係」をわかりやすく説明します。
- 経済合理性だけでなく、安心感・心理的な側面も含めて整理します。
- 最終的な意思決定は、ユーザー本人か対面の有資格者（FP・保険募集人等）に委ねることを、要所で軽く伝えてください。

【特に強調してほしいポイント】
- まず最初に、ユーザーに対して
  「投資と保険が混ざった商品は、“投資部分”と“純粋な保障部分”を分けて考えてみましょう」
  とやさしく促してください。
- それから、今回のシナリオにおいて、
  - 保険料全体のうち、どの部分が「リスクへの備え」で、
  - どの部分が「貯蓄・投資的な性格」を持っていそうか
  を、あくまで一般論として整理してください。
- 診断後に保険料が上がるタイプの場合は、
  「診断前」「診断後」の2つのフェーズを分けて考えると理解しやすい、というフレームを提案してください。

【回答スタイル】
- 最初に2〜3行で「今の状況をどう整理すると良いか」をまとめてください。
- その後、「構造の分解」「数値シミュレーション結果の読み方」「判断の視点」の順で説明してください。
- 難しい用語は使わず、優しいお医者さんのように、落ち着いたトーンで話してください。
- 日本の公的医療保険（3割負担や高額療養費制度）があるため、多くの場合、
  医療費の全額を民間保険でカバーする必要はない、という前提で説明してください。
- まず「公的保険でどこまで守られるか」を一般論として軽く示したうえで、
  そのうえで民間保険で上乗せする部分をどう考えるか、という順番で整理してください。
- ただし、具体的な金額の上限や制度の細かい条件は簡略化し、「概ね自己負担には上限がある」といったレベルで説明してください。
`;

    const scenarioText = JSON.stringify(scenario, null, 2);

    const userContent = `ユーザーからの相談内容:
${userMessage}

前提となるデータ（保険の一覧・数値シミュレーション結果など）:
${scenarioText}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.4,
    });

    const reply = completion.choices[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: "高度相談チャットでエラーが発生しました。" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

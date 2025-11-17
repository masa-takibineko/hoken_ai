// app/api/parse_policy/route.ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text } = body;

    const systemPrompt = `
あなたは、日本の個人向け保険商品を「構造として分解する」専門のアシスタントです。

【やること】
- ユーザーが書いた保険の説明文から、
  - 「主な保障内容（どのリスクに、いくらの給付が出るか）」
  - 「保険料（月額）」
  - 「投資・貯蓄的な部分があるかどうか」
  を読み取り、シンプルなJSONで出力してください。

【重要な制限】
- 特定の保険会社や商品をおすすめしたり、「この保険に入るべき／解約すべき」といった判断は一切しないでください。
- ここでは「構造の分解」だけを行います。

【JSONのフォーマット】
必ず次の形式のJSONだけを返してください（説明文は不要）：

{
  "product_name": "文字列（わからなければ null）",
  "monthly_premium": 数値または null,
  "has_investment_part": true/false,
  "main_coverage": {
    "risk_type": "cancer" | "medical" | "death" | "income_protection" | "nursing_care" | "other",
    "label": "例: がん診断一時金",
    "benefit_type": "lump_sum" | "daily" | "monthly" | "other",
    "benefit_amount": 数値または null,
    "note": "読み取れた範囲での補足（任意）"
  },
  "other_coverages": [
    {
      "risk_type": "...",
      "label": "...",
      "benefit_type": "...",
      "benefit_amount": 数値または null,
      "note": "任意"
    }
  ],
  "comment_for_user": "ユーザー向けの日本語での一言コメント（この保険は◯◯のリスクに備えるもの、など）"
}

【読み取りの方針】
- もし「がん診断一時金」や「死亡保障」など、一時金タイプの保障があれば、それを main_coverage に選んでください。
- 入院日額など日額タイプしか読み取れない場合は、benefit_type を "daily" にして main_coverage に置いてください。
- 保険料が「年払い」「月払い」などで書かれていれば、可能な範囲で月額に換算してください（だいたいでOK）。
- 外貨建てや積立金が明らかに含まれる場合は has_investment_part を true にしてください。
`;

    const userContent = `以下が保険商品の説明文です。日本語で書かれています：

${text}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: "保険内容の分解に失敗しました。" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

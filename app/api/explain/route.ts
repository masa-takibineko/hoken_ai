// app/api/explain/route.ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      monthlyPremium,
      benefitAmount,
      annualRate,
      results,
      breakEven,
      riskInfo,
    } = body;

    // 結果をざっくりテキストに整形（モデルに渡す用）
    const lines = results.map((r: any) => {
      return `${r.years}年後: 累計保険料=${Math.round(
        r.totalPremium
      )}円, 投資なら=${Math.round(
        r.fvInvest
      )}円, 保険の実質的な得(給付金-保険料)=${Math.round(
        r.netInsurance
      )}円, 保険-投資=${Math.round(r.diffInsMinusInv)}円`;
    });

    const breakEvenText = breakEven
      ? `おおよそ ${breakEven.approxYear.toFixed(
          1
        )} 年目前後（${breakEven.fromYear}〜${
          breakEven.toYear
        }年の間）で、保険と投資の有利不利が入れ替わる傾向があります。`
      : "今回のシミュレーション範囲では、保険と投資の有利不利が入れ替わるポイントは見つかりませんでした。";

    const riskText = riskInfo
      ? `なお、一般的な統計では、${riskInfo.age_from}〜${
          riskInfo.age_to
        }歳・${riskInfo.sex === "male"
          ? "男性"
          : riskInfo.sex === "female"
          ? "女性"
          : "全体"}における「${riskInfo.risk_type}」の年間発生確率はおよそ ${
          (riskInfo.annual_prob * 100).toFixed(2)
        }% 程度とされています（出典: ${riskInfo.source_name ?? "不明"}）。`
      : "一般的なリスク統計は、今回の条件では見つかりませんでした。";

    const prompt = `
あなたは「保険と投資の数値比較に特化した、中立的な保険理解AI」です。
ユーザーの状況に対して、まず結論を短く述べ、そのあと理由を数値ベースで説明してください。
感情を煽らず、優しいお医者さんのような口調で、経済的な合理性と安心感のバランスを取ってください。

【ユーザーの入力】
- 月額保険料: ${monthlyPremium} 円
- 代表的な給付金額: ${benefitAmount} 円
- 投資に回した場合の想定年利: ${annualRate} %

【シミュレーション結果（要約）】
${lines.join("\n")}

【損益分岐点の説明】
${breakEvenText}

【一般的なリスク統計】
${riskText}

【出力フォーマット】
1. 最初に 2〜3 行で「この保険は、経済合理性の面では◯◯寄り」と日本語で結論を述べる。
2. 次に、「何年以内に事故が起きた場合は保険が有利」「何年以上だと投資が有利」と、年数と金額を使って説明する。
3. 最後に、「経済的な合理性」と「安心感」の両方の観点から、ユーザーが判断するときのポイントを2〜3個に整理して伝える。
4. 特定の商品や会社を名指しで推奨してはいけません。「解約すべき」「絶対やめた方がいい」といった断定的な表現も避けてください。
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "あなたは中立的で誠実な保険理解サポートAIです。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    });

    const answer = completion.choices[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ explanation: answer }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: "AI解説でエラーが発生しました。" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

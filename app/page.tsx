"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// 年利で毎月積み立てした場合の将来価値（複利）
function futureValueInvest(
  monthlyPremium: number,
  annualRate: number,
  years: number
) {
  const r = annualRate;
  const m = r / 12; // 月利
  const n = 12 * years; // 月数
  if (m === 0) {
    return monthlyPremium * n;
  }
  const fv = (monthlyPremium * ((1 + m) ** n - 1)) / m;
  return fv;
}

// t年までの保険料累計
function totalPremium(monthlyPremium: number, years: number) {
  return monthlyPremium * 12 * years;
}

type SimulationPoint = {
  years: number;
  totalPremium: number;
  fvInvest: number;
  netInsurance: number;
  netInvest: number;
  diffInsMinusInv: number;
};

type BreakEvenInfo = {
  approxYear: number;
  fromYear: number;
  toYear: number;
} | null;

type RiskInfo = {
  risk_type: string;
  sex: string;
  age_from: number;
  age_to: number;
  annual_prob: number;
  lifetime_prob: number | null;
  note: string | null;
  source_name: string | null;
  source_url: string | null;
};


// 5年刻みで40年まで
const DEFAULT_YEARS_LIST = [3, 5, 10, 15, 20, 25, 30, 35, 40];

const DEFAULT_ANNUAL_RATE = 0.05;

// UIで見せる保険カテゴリの定義
const INSURANCE_TYPES = [
  {
    value: "cancer",
    label: "がん保険",
    short: "がんと診断されたときの一時金や入院・通院費をサポートする保険です。",
  },
  {
    value: "medical",
    label: "医療保険（入院・手術）",
    short: "病気やケガで入院・手術した際の自己負担分をカバーする保険です。",
  },
  {
    value: "term_life",
    label: "定期保険（一定期間の死亡保障）",
    short: "一定期間だけ大きな死亡保障を確保したいときに使われるシンプルな生命保険です。",
  },
  {
    value: "whole_life",
    label: "終身保険（貯蓄性のある死亡保障）",
    short: "一生涯の死亡保障に、貯蓄・解約返戻金の要素が組み合わさった保険です。",
  },
  {
    value: "income_protection",
    label: "収入保障・就業不能保険",
    short: "働けなくなった場合に、毎月の生活費をカバーするための保険です。",
  },
  {
    value: "nursing_care",
    label: "介護保険",
    short: "要介護状態になった際の一時金や年金として支払われる保険です。",
  },
  {
    value: "personal_pension",
    label: "個人年金保険（老後資金）",
    short: "老後の生活資金を積み立てて、将来年金として受け取るタイプの保険です。",
  },
  {
    value: "fire_earthquake",
    label: "火災・地震保険（マイホーム向け）",
    short: "火災や地震などで自宅や家財が損害を受けた場合の再建費用をカバーします。",
  },
  {
    value: "auto",
    label: "自動車保険（任意保険）",
    short: "対人・対物賠償や車両保険など、事故時の大きな賠償リスクをカバーします。",
  },
  {
    value: "accident",
    label: "傷害保険（ケガ全般）",
    short: "日常生活やレジャー中のケガによる治療費・死亡・後遺障害を補償します。",
  },
  {
    value: "other",
    label: "その他・よくわからない保険",
    short: "パンフレットの内容を見ながら、一緒に中身を分解して整理していきます。",
  },
] as const;

type InsuranceTypeValue = (typeof INSURANCE_TYPES)[number]["value"];

const GENERAL_COMMENTS: Record<InsuranceTypeValue, string> = {
  cancer:
    "がん保険は、「一度がんと診断されると、まとまった一時金が必要になる」という前提で設計されています。一方で、公的医療保険の高額療養費制度などもあり、すべてを民間保険で賄う必要はありません。「がんになったときに、家計としてどのくらいの自己負担なら許容できるか？」を考えると、必要な保障額のイメージがつきやすくなります。",
  medical:
    "医療保険は、入院や手術時の自己負担分をなだらかにする役割があります。ただし、日本では公的医療保険があるため、長期入院や高額な治療でなければ、貯蓄で対応できるケースも少なくありません。「貯蓄でカバーできない大きな医療費リスク」をどこまで保険に任せるかがポイントです。",
  term_life:
    "定期保険は、「子どもが独立するまで」「住宅ローンが残っている期間だけ」など、期間限定で大きな死亡保障を確保したいときに使われることが多いです。掛け捨ての分、保険料は比較的安くなります。必要な期間と金額を絞って考えることで、保険料を抑えながら大きなリスクに備えることができます。",
  whole_life:
    "終身保険は、一生涯の死亡保障と貯蓄性を兼ね備えた商品が多いです。その分、同じ保障額の定期保険と比べて保険料は高くなりがちです。「純粋な保障」として必要なのか、「貯蓄や相続対策」として使いたいのかを分けて考えると、他の手段（投資や積立）との比較がしやすくなります。",
  income_protection:
    "収入保障・就業不能保険は、「長期間働けなくなったときにも生活費を維持する」ことを目的とした保険です。特に、世帯の収入源が一人に偏っている場合や、住宅ローンが残っている場合などに重要度が高くなります。一方で、傷病手当金や障害年金など、公的な仕組みでどこまでカバーされるかも合わせて確認するのが大切です。",
  nursing_care:
    "介護保険は、要介護状態になったときの長期にわたる生活費・介護費用をカバーするための保険です。公的介護保険の自己負担分や、介護施設を利用した場合の上乗せ費用など、「どのくらいの期間・水準の介護を想定するか」で必要額が変わります。老後資金全体の設計とのバランスを見ながら検討するのがポイントです。",
  personal_pension:
    "個人年金保険は、老後の生活資金を積み立てて将来年金として受け取る商品です。貯蓄性が高い一方で、途中解約すると元本割れすることも多く、インフレへの耐性も限定的です。「長期で拘束される資金」として見たときに、同じお金を投資に回した場合との比較が重要になります。",
  fire_earthquake:
    "火災・地震保険は、マイホームなど高額な資産が一度で大きく損なわれるリスクに備えるための保険です。特に地震は頻度こそ低いものの、一度発生した場合の損害額が非常に大きいため、「めったに起きないが起きたら家計が破綻するリスク」に属します。自己負担で再建できるかどうかが、保険の必要性を判断する軸になります。",
  auto:
    "自動車保険（任意保険）は、対人・対物賠償など「他人を巻き込むリスク」が非常に大きいため、多くの人にとって必須に近い保険です。特に対人・対物賠償は、ほぼ無制限に近い水準での備えが一般的です。一方で、車両保険などは、車の価値や家計の余裕によって必要性が変わります。",
  accident:
    "傷害保険は、レジャーやスポーツ、日常生活でのケガによる入院・通院・死亡・後遺障害などをカバーします。既に医療保険や団体保険に加入している場合、内容が重複していることも多いため、「何に対して」「いくらまで」保障されているのかを全体で整理することが大切です。",
  other:
    "パンフレットや保険証券を一度分解してみると、「実質的には医療＋がん」「貯蓄＋死亡保障」など、既存のカテゴリに近い形に整理できることが多いです。一度、どのリスクとどの金額に対応しているのかに分解してから考えると、不要な重複や過剰な保障に気づきやすくなります。",
};

function simulatePolicy(
  monthlyPremium: number,
  benefitAmount: number,
  annualRate: number = DEFAULT_ANNUAL_RATE,
  yearsList: number[] = DEFAULT_YEARS_LIST
): SimulationPoint[] {
  return yearsList.map((t) => {
    const total = totalPremium(monthlyPremium, t);
    const fv = futureValueInvest(monthlyPremium, annualRate, t);
    const netIns = benefitAmount - total;
    const netInv = fv;
    const diff = netIns - netInv;
    return {
      years: t,
      totalPremium: total,
      fvInvest: fv,
      netInsurance: netIns,
      netInvest: netInv,
      diffInsMinusInv: diff,
    };
  });
}

function findBreakEven(points: SimulationPoint[]): BreakEvenInfo {
  let prev: SimulationPoint | null = null;
  for (const p of points) {
    if (prev) {
      if (prev.diffInsMinusInv >= 0 && p.diffInsMinusInv <= 0) {
        return {
          approxYear: (prev.years + p.years) / 2,
          fromYear: prev.years,
          toYear: p.years,
        };
      }
    }
    prev = p;
  }
  return null;
}

export default function Home() {
  const [monthlyPremium, setMonthlyPremium] = useState<string>("3000");
  const [benefitAmount, setBenefitAmount] = useState<string>("1000000");
  const [annualRate, setAnnualRate] = useState<string>("5");

  const [riskType, setRiskType] = useState<InsuranceTypeValue>("cancer");
  const [age, setAge] = useState<string>("40");
  const [sex, setSex] = useState<string>("male");

  const [results, setResults] = useState<SimulationPoint[] | null>(null);
  const [breakEven, setBreakEven] = useState<BreakEvenInfo>(null);
  const [riskInfo, setRiskInfo] = useState<RiskInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [loadingExplain, setLoadingExplain] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>("");
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  // AIが分解した保険の要約
  const [parsedSummary, setParsedSummary] = useState<string | null>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [policyText, setPolicyText] = useState(""); // ユーザーが貼る説明文
  

  const handleSimulate = async () => {
    setError(null);
    setAiExplanation(null);

    const m = Number(monthlyPremium);
    const b = Number(benefitAmount);
    const rPercent = Number(annualRate);
    const ageNum = Number(age);

    if (!m || !b || !rPercent) {
      setError("月額保険料・給付金額・年利はすべて数値で入力してください。");
      return;
    }
    if (!ageNum) {
      setError("年齢は数値で入力してください。");
      return;
    }

    const r = rPercent / 100;
    const points = simulatePolicy(m, b, r, DEFAULT_YEARS_LIST);
    const be = findBreakEven(points);

    setResults(points);
    setBreakEven(be);

    // Supabaseから一般的なリスク統計を取得
    const { data, error: riskError } = await supabase
      .from("risk_stats")
      .select("*")
      .eq("risk_type", riskType)
      .gte("age_from", ageNum)
      .lte("age_to", ageNum)
      .in("sex", [sex, "all"]);

    if (riskError) {
      console.error("Error fetching risk stats:", riskError);
      setRiskInfo(null);
    } else if (data && data.length > 0) {
      const row = data[0] as any;
      setRiskInfo({
        risk_type: row.risk_type,
        sex: row.sex,
        age_from: row.age_from,
        age_to: row.age_to,
        annual_prob: row.annual_prob,
        lifetime_prob: row.lifetime_prob,
        note: row.note,
        source_name: row.source_name,
        source_url: row.source_url,
      });
    } else {
      setRiskInfo(null);
    }
  };


  const handleExplainByAI = async () => {
    if (!results) return;
    setLoadingExplain(true);
    setAiExplanation(null);

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          monthlyPremium: Number(monthlyPremium),
          benefitAmount: Number(benefitAmount),
          annualRate: Number(annualRate),
          results,
          breakEven,
          riskInfo,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error(data);
        setAiExplanation(
          "AIによる説明の取得に失敗しました。時間をおいて再度お試しください。"
        );
        return;
      }

      const data = await res.json();
      setAiExplanation(data.explanation);
    } catch (e) {
      console.error(e);
      setAiExplanation(
        "AIによる説明の取得中にエラーが発生しました。"
      );
    } finally {
      setLoadingExplain(false);
    }
  };

  const handleParsePolicy = async () => {
    if (!policyText.trim()) return;
    setParseLoading(true);
    setParsedSummary(null);

    try {
      const res = await fetch("/api/parse_policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: policyText }),
      });

      if (!res.ok) {
        setParsedSummary("保険の分解に失敗しました。文章を少し短くして再度お試しください。");
        return;
      }

      const data = await res.json();

      // 1. 月額保険料と主な給付を、既存の入力欄に反映
      if (data.monthly_premium) {
        setMonthlyPremium(String(Math.round(data.monthly_premium)));
      }
      if (data.main_coverage && data.main_coverage.benefit_amount) {
        setBenefitAmount(String(Math.round(data.main_coverage.benefit_amount)));
      }

      // 2. 保険の種類（riskType）も推定で合わせる
      if (data.main_coverage && data.main_coverage.risk_type) {
        setRiskType(data.main_coverage.risk_type as InsuranceTypeValue);
      }

      // 3. ユーザー向けの要約コメントを表示
      const lines: string[] = [];
      if (data.product_name) {
        lines.push(`推定された商品名：${data.product_name}`);
      }
      if (data.monthly_premium) {
        lines.push(`推定された月額保険料：約 ${Math.round(data.monthly_premium).toLocaleString()} 円`);
      }
      if (data.main_coverage) {
        lines.push(
          `主な保障：${data.main_coverage.label}（${data.main_coverage.benefit_type}）`
        );
        if (data.main_coverage.benefit_amount) {
          lines.push(
            `主な給付金額：約 ${Math.round(
              data.main_coverage.benefit_amount
            ).toLocaleString()} 円`
          );
        }
      }
      if (data.has_investment_part) {
        lines.push("この保険には「貯蓄・投資」の性格を持つ部分も含まれている可能性があります。");
      }
      if (data.comment_for_user) {
        lines.push("");
        lines.push(data.comment_for_user);
      }

      setParsedSummary(lines.join("\n"));
    } catch (e) {
      console.error(e);
      setParsedSummary("保険の分解中にエラーが発生しました。");
    } finally {
      setParseLoading(false);
    }
  };


  const handleAdvancedChat = async () => {
    if (!chatInput.trim()) return;
    setChatLoading(true);
    setChatReply(null);

    try {
      // シナリオとしてAIに渡す情報をまとめる
      const scenario = {
        age: Number(age),
        sex,
        riskType,
        annualRate: Number(annualRate),
        results,        // シミュレーション結果（あれば）
        breakEven,
        riskInfo,
      };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: chatInput,
          scenario,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error(data);
        setChatReply(
          "AIとの高度相談の取得に失敗しました。時間をおいて再度お試しください。"
        );
        return;
      }

      const data = await res.json();
      setChatReply(data.reply);
    } catch (e) {
      console.error(e);
      setChatReply(
        "AIとの高度相談中にエラーが発生しました。"
      );
    } finally {
      setChatLoading(false);
    }
  };


  const selectedType = INSURANCE_TYPES.find((t) => t.value === riskType)!;
  const generalComment = GENERAL_COMMENTS[riskType];

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* ヒーロー */}
        <header className="mb-6">
          <div className="rounded-2xl bg-gradient-to-r from-sky-100 via-emerald-50 to-slate-50 border border-sky-100 px-6 py-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mb-1">
                保険を「売らない」家計ドクターAI
              </h1>
              <p className="text-sm md:text-base text-slate-700">
                あなたの家計を見直すための保険診断ツール。保険を売らないからこそ、
                「保険に入る」場合と「投資に回す」場合を中立な目線で比べることができます。
              </p>
            </div>
            <div className="mt-2 md:mt-0 text-xs md:text-sm text-slate-600 bg-white/70 border border-sky-100 rounded-xl px-4 py-3 shadow-sm">
              <div className="font-semibold mb-1">このツールでできること</div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>月額保険料と給付金の規模感を数値で整理</li>
                <li>保険 vs 投資の損益分岐点をざっくり把握</li>
                <li>AIがあなたの状況に合わせてやさしく解説</li>
              </ul>
            </div>
          </div>
        </header>

        {/* 入力エリア */}
        <section className="grid gap-5 md:grid-cols-2 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">
              Step 1. どんなリスクに備える保険か？
            </h2>

            <div>
              <label className="block text-xs font-medium mb-1 text-slate-600">
                保険の種類
              </label>
              <select
                className="border rounded-lg px-3 py-2 w-full text-sm bg-slate-50"
                value={riskType}
                onChange={(e) => setRiskType(e.target.value as InsuranceTypeValue)}
              >
                {INSURANCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-600 mt-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                {selectedType.short}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600">
                  あなたの年齢（歳）
                </label>
                <input
                  type="number"
                  className="border rounded-lg px-3 py-2 w-full text-sm bg-white"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600">
                  性別
                </label>
                <select
                  className="border rounded-lg px-3 py-2 w-full text-sm bg-white"
                  value={sex}
                  onChange={(e) => setSex(e.target.value)}
                >
                  <option value="male">男性</option>
                  <option value="female">女性</option>
                  <option value="all">その他・どちらでもない</option>
                </select>
              </div>
            </div>

            <div className="text-xs text-slate-500 border-t pt-3 mt-1">
              ※この情報は診断中のみ使用され、サーバー側には保存されません。
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">
              Step 2. 保険料と給付金のイメージ
            </h2>

            <div>
              <label className="block text-xs font-medium mb-1 text-slate-600">
                月額保険料（円）
              </label>
              <input
                type="number"
                className="border rounded-lg px-3 py-2 w-full text-sm bg-white"
                value={monthlyPremium}
                onChange={(e) => setMonthlyPremium(e.target.value)}
                placeholder="例: 3000"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-slate-600">
                代表的な給付金額（円）
              </label>
              <input
                type="number"
                className="border rounded-lg px-3 py-2 w-full text-sm bg-white"
                value={benefitAmount}
                onChange={(e) => setBenefitAmount(e.target.value)}
                placeholder="例: 1000000（100万円）"
              />
              <p className="text-xs text-slate-500 mt-1">
                その保険で「一番イメージしやすい場面」を1つだけ選んで入力してください。
                （例：がん診断一時金、死亡保険金など）
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-slate-600">
                投資に回した場合の想定年利（%）
              </label>
              <input
                type="number"
                className="border rounded-lg px-3 py-2 w-full text-sm bg-white"
                value={annualRate}
                onChange={(e) => setAnnualRate(e.target.value)}
                placeholder="例: 5"
              />
              <p className="text-xs text-slate-500 mt-1">
                デフォルトは 5%（インデックス投資などをざっくり想定）です。
                リスク許容度に合わせて変更してもOKです。
              </p>
            </div>
          </div>
        </section>
        <div>
          <button
            onClick={handleSimulate}
            className="px-5 py-2.5 rounded-full bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold shadow-sm transition"
          >
            数値シミュレーションを実行する
          </button>
        </div>
        {/* 保険説明文をAIに分解させる */}
        <section className="mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-sky-100 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">
              任意：保険の説明文をAIに分解してもらう
            </h2>
            <p className="text-xs text-slate-600">
              パンフレットやWebサイトの説明文、そのまま聞いた内容などをここに貼り付けると、
              AIが「主な保障」と「月額保険料」のイメージを抽出して、上の入力欄に反映します。
              投資と保険が混ざった商品も、まずは構造を分けて整理します。
            </p>

            <textarea
              className="border rounded-lg px-3 py-2 w-full text-sm bg-slate-50"
              rows={4}
              placeholder="例：◯◯生命の新がん総合保障プランに加入しています。月額は4,980円で、がんと診断されたときに100万円、入院1日5,000円、10年ごとに生存給付金が10万円あります…"
              value={policyText}
              onChange={(e) => setPolicyText(e.target.value)}
            />

            <button
              type="button"
              onClick={handleParsePolicy}
              disabled={parseLoading}
              className="px-4 py-2 rounded-full bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-60"
            >
              {parseLoading
                ? "AIが保険の中身を読み取っています..."
                : "AIに保険の中身を分解してもらう"}
            </button>

            {parsedSummary && (
              <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-xs whitespace-pre-wrap text-slate-800">
                {parsedSummary}
              </div>
            )}

            <p className="text-[11px] text-slate-500">
              ※ ここで抽出された月額保険料と主な給付金額は、「保険 vs 投資」のシミュレーションにそのまま使われます。
              詳細な特約すべてを完全に再現するわけではなく、「この保険の中心はどこか？」をざっくり掴むための機能です。
            </p>
          </div>
        </section>


        {error && (
          <p className="text-sm text-red-600 mb-3">{error}</p>
        )}

        {/* 一般的な保険の考え方 */}
        <section className="mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-sm">
            <div className="font-semibold text-slate-700 mb-1">
              ちなみに、{selectedType.label}について一般的には…
            </div>
            <p className="text-slate-700 leading-relaxed">
              {generalComment}
            </p>
          </div>
        </section>

        {/* 結果エリア */}
        {results && (
          <section className="space-y-4 mb-10">
            {riskInfo && (
              <div className="border rounded-2xl p-4 bg-sky-50 text-sm border-sky-100">
                <div className="font-semibold mb-1 text-sky-900">
                  リスクの大きさのイメージ（参考情報）
                </div>
                <p className="text-sky-900">
                  {riskInfo.age_from}〜{riskInfo.age_to}歳・
                  {riskInfo.sex === "male"
                    ? "男性"
                    : riskInfo.sex === "female"
                    ? "女性"
                    : "全体"}
                  における「{riskInfo.risk_type}」の年間発生確率は、
                  およそ{" "}
                  <span className="font-bold">
                    {(riskInfo.annual_prob * 100).toFixed(2)}%
                  </span>
                  {" "}程度とされています。
                </p>
                {riskInfo.source_name && (
                  <p className="text-xs text-slate-600 mt-1">
                    出典: {riskInfo.source_name}
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-2">
                  ※あくまで統計上の目安であり、あなた個人の将来を確定するものではありません。
                </p>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <h2 className="text-base font-semibold mb-2 text-slate-800">
                シミュレーション結果（保険 vs 投資）
              </h2>

              {breakEven ? (
                <p className="mb-3 text-sm text-slate-700">
                  おおよそ{" "}
                  <span className="font-bold">
                    {breakEven.approxYear.toFixed(1)}年目
                  </span>{" "}
                  前後（{breakEven.fromYear}〜{breakEven.toYear}年の間）を境に、
                  それより早いタイミングで事故が起きれば
                  <span className="font-semibold">「保険」</span>
                  が有利になりやすく、
                  それより遅いタイミングであれば
                  <span className="font-semibold">「投資」</span>
                  の方が有利になりやすい、という傾向が見られます。
                </p>
              ) : (
                <p className="mb-3 text-sm text-slate-700">
                  設定された条件では、シミュレーション範囲内で
                  保険と投資の優劣がはっきり入れ替わる損益分岐点は見つかりませんでした。
                  「保険の安心感」と「投資の増え方」のバランスで考えるイメージになります。
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm border border-slate-200">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-200 px-2 py-1">
                        経過年数
                      </th>
                      <th className="border border-slate-200 px-2 py-1">
                        累計保険料
                      </th>
                      <th className="border border-slate-200 px-2 py-1">
                        投資ならの将来価値（年利 {annualRate || "5"}%）
                      </th>
                      <th className="border border-slate-200 px-2 py-1">
                        保険の実質的な得
                        <br />
                        （給付金 − 累計保険料）
                      </th>
                      <th className="border border-slate-200 px-2 py-1">
                        保険 − 投資
                        <br />
                        （＋なら保険有利）
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row) => (
                      <tr key={row.years}>
                        <td className="border border-slate-200 px-2 py-1 text-center">
                          {row.years}年後
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-right">
                          {Math.round(row.totalPremium).toLocaleString()} 円
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-right">
                          {Math.round(row.fvInvest).toLocaleString()} 円
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-right">
                          {Math.round(row.netInsurance).toLocaleString()} 円
                        </td>
                        <td
                          className={`border border-slate-200 px-2 py-1 text-right ${
                            row.diffInsMinusInv > 0
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}
                        >
                          {Math.round(row.diffInsMinusInv).toLocaleString()} 円
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {aiExplanation && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-sm whitespace-pre-wrap">
                <div className="font-semibold mb-2 text-emerald-900">
                  AIによるやさしい解説
                </div>
                <p className="text-emerald-900 leading-relaxed">
                  {aiExplanation}
                </p>
              </div>
            )}
          </section>
        )}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          {results && (
            <button
              onClick={handleExplainByAI}
              className="px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition disabled:opacity-60"
              disabled={loadingExplain}
            >
              {loadingExplain
                ? "AIがあなたのケースを整理しています..."
                : "AIにやさしく解説してもらう"}
            </button>
          )}
        </div>
        {/* 高度な相談用チャット */}
        <section className="mb-10">
          <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-emerald-900">
              もっと複雑な事情を整理したいときの相談窓口（AI）
            </h2>
            <p className="text-xs text-emerald-900">
              複数の保険に入っている、診断後に保険料が上がる、投資と保険が混ざった商品がよく分からない、
              などの「ややこしいケース」を、数値結果とあわせて整理したいときの相談窓口です。
              <br />
              具体的な保険商品のおすすめや、「解約すべき・入るべき」といった判断は行わず、
              あくまで考え方や構造を整理することだけを目的としています。
            </p>

            <textarea
              className="border rounded-lg px  -3 py-2 w-full text-sm bg-emerald-50"
              rows={3}
              placeholder="例：今入っている3つの保険のうち、がんと就業不能の部分をどう整理すればよいか知りたいです。がん診断後は保険料が上がると聞きましたが、投資と比べてどう考えるべきでしょうか？"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleAdvancedChat}
                disabled={chatLoading}
                className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60"
              >
                {chatLoading ? "AIが整理しています..." : "AIに複雑な事情を整理してもらう"}
              </button>
              <p className="text-[11px] text-slate-500">
                ※ ここで入力した内容は、保険の構造を整理するためだけに使われます。
                特定の商品や会社のおすすめは表示されません。
              </p>
            </div>

            {chatReply && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-sm whitespace-pre-wrap text-emerald-900">
                {chatReply}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

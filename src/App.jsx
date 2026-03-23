import { useState, useEffect, useRef } from "react";

const SYSTEM_PROMPT = `당신은 따뜻하고 공감적인 마음 상담 챗봇 "마음이"입니다.

## 역할
사용자와 자연스러운 대화를 나누면서, 대화 흐름 속에 PHQ-9(우울)와 GAD-7(불안) 문항의 내용을 자연스럽게 녹여서 질문합니다. 절대 설문지처럼 느껴지면 안 됩니다.

## PHQ-9 평가 영역 (우울)
1. 흥미/즐거움 상실
2. 우울감/절망감
3. 수면 문제
4. 피로/에너지 부족
5. 식욕 변화
6. 자존감 저하/죄책감
7. 집중력 저하
8. 행동/말 속도 변화
9. 자해 사고 (매우 조심스럽게, 대화 후반부에서만)

## GAD-7 평가 영역 (불안)
1. 초조/불안감
2. 걱정 조절 불능
3. 과도한 걱정
4. 이완 곤란
5. 안절부절
6. 짜증/분노
7. 공포/두려움

## 대화 규칙
- 첫 인사는 이미 했으므로, 사용자의 첫 응답부터 공감하며 자연스럽게 대화를 이어가세요.
- 한 번에 1개의 평가 영역만 자연스럽게 탐색하세요.
- 사용자의 답변에 먼저 충분히 공감한 후 다음 주제로 넘어가세요.
- 직접적으로 "0~3점 중 몇 점입니까" 같은 질문은 절대 하지 마세요.
- 대신 "요즘 잠은 좀 잘 주무시나요?", "밥맛은 좀 어떠세요?" 같은 일상적 질문으로 녹여내세요.
- 사용자의 답변으로부터 해당 영역의 심각도를 내부적으로 0(전혀없음)~3(거의매일) 스케일로 추정하세요.
- 9번 영역(자해)은 반드시 대화 후반에, 매우 조심스럽고 돌려서 질문하세요.

## 응답 형식
모든 응답은 반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트 없이 JSON만 출력하세요.

{
  "message": "사용자에게 보여줄 공감적 대화 메시지",
  "assessed": [
    {"area": "phq_1", "score": 0, "reasoning": "판단 근거"}
  ],
  "areas_covered_so_far": ["phq_1", "phq_3"],
  "phase": "conversation|wrapping_up|complete"
}

- assessed: 이번 턴에서 새로 평가한 영역만 포함 (없으면 빈 배열)
- areas_covered_so_far: 지금까지 대화 전체에서 평가 완료된 모든 영역 누적 목록
- phase: 
  - "conversation": 아직 탐색 중
  - "wrapping_up": 12개 이상 영역을 평가했으면 자연스럽게 대화를 마무리
  - "complete": 충분히 평가했고 마무리 인사까지 완료

영역 키: phq_1~phq_9, gad_1~gad_7

## 중요
- 따뜻하고 비판단적인 어조를 유지하세요.
- 응답은 2~4문장으로 간결하게.
- 사용자가 힘든 이야기를 하면 충분히 공감하세요.
- 모든 영역을 반드시 다 평가할 필요 없습니다. 12개 이상이면 마무리해도 됩니다.
- "complete" phase가 되면, 마지막 메시지에서 대화를 따뜻하게 마무리하세요.`;

function getDepressionLevel(score) {
  if (score <= 4) return { level: "정상 범위", color: "#4ade80", emoji: "🌿", bg: "rgba(74,222,128,0.08)" };
  if (score <= 9) return { level: "경미한 우울", color: "#a3e635", emoji: "🌤", bg: "rgba(163,230,53,0.08)" };
  if (score <= 14) return { level: "중등도 우울", color: "#facc15", emoji: "☁️", bg: "rgba(250,204,21,0.08)" };
  if (score <= 19) return { level: "중등도-심한 우울", color: "#f97316", emoji: "🌧", bg: "rgba(249,115,22,0.08)" };
  return { level: "심한 우울", color: "#ef4444", emoji: "⛈", bg: "rgba(239,68,68,0.08)" };
}

function getAnxietyLevel(score) {
  if (score <= 4) return { level: "정상 범위", color: "#4ade80", emoji: "🌿", bg: "rgba(74,222,128,0.08)" };
  if (score <= 9) return { level: "경미한 불안", color: "#a3e635", emoji: "🌤", bg: "rgba(163,230,53,0.08)" };
  if (score <= 14) return { level: "중등도 불안", color: "#facc15", emoji: "☁️", bg: "rgba(250,204,21,0.08)" };
  return { level: "심한 불안", color: "#ef4444", emoji: "⛈", bg: "rgba(239,68,68,0.08)" };
}

const AREA_LABELS = {
  phq_1: "흥미/즐거움", phq_2: "우울감", phq_3: "수면", phq_4: "피로",
  phq_5: "식욕", phq_6: "자존감", phq_7: "집중력", phq_8: "행동변화", phq_9: "자해사고",
  gad_1: "불안감", gad_2: "걱정조절", gad_3: "과도한걱정", gad_4: "이완곤란",
  gad_5: "안절부절", gad_6: "짜증", gad_7: "두려움",
};

// Mock response generator for testing
const getMockResponse = (userMsg, coveredAreas) => {
  const nextArea = Object.keys(AREA_LABELS).find(key => !coveredAreas.includes(key)) || "phq_1";
  const isLast = coveredAreas.length >= 11;
  return {
    message: isLast 
      ? "지금까지 많은 이야기를 해주셔서 감사해요. 이제 대화를 마무리해볼까요? 당신의 마음이 조금은 가벼워졌기를 바라요."
      : `그렇군요, 충분히 그럴 수 있어요. ${userMsg.slice(0, 10)}... 관련해서 말씀해주시니 마음이 쓰이네요. 혹시 요즘 ${AREA_LABELS[nextArea]} 부분은 좀 어떠신가요?`,
    assessed: [{ area: nextArea, score: Math.floor(Math.random() * 4), reasoning: "모의 대화 기반 추정" }],
    areas_covered_so_far: [...coveredAreas, nextArea],
    phase: isLast ? (coveredAreas.length >= 12 ? "complete" : "wrapping_up") : "conversation"
  };
};

const TypingIndicator = () => (
  <div style={{ display: "flex", gap: 4, padding: "8px 0", alignItems: "center" }}>
    {[0, 1, 2].map(i => (
      <div key={i} style={{
        width: 7, height: 7, borderRadius: "50%", background: "#64748b",
        animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
      }} />
    ))}
    <style>{`@keyframes bounce { 0%,60%,100% { transform: translateY(0); opacity:0.4; } 30% { transform: translateY(-6px); opacity:1; } }`}</style>
  </div>
);

const GaugeRing = ({ score, max, color, label }) => {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / max) * circ;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 48 48)" style={{ transition: "stroke-dashoffset 1s ease" }} />
        <text x="48" y="44" textAnchor="middle" fill="#e2e8f0" fontSize="20" fontWeight="600" fontFamily="'DM Serif Display',Georgia,serif">{score}</text>
        <text x="48" y="60" textAnchor="middle" fill="#64748b" fontSize="10">/ {max}</text>
      </svg>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{label}</div>
    </div>
  );
};

export default function MindChat() {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem("mind-chat-messages");
    return saved ? JSON.parse(saved) : [{ role: "assistant", content: "안녕하세요 😊 저는 마음 상담 도우미 '마음이'예요.\n\n오늘의 기분은 어떠세요?" }];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState(() => {
    const saved = localStorage.getItem("mind-chat-scores");
    return saved ? JSON.parse(saved) : {};
  });
  const [phase, setPhase] = useState(() => localStorage.getItem("mind-chat-phase") || "conversation");
  const [showResult, setShowResult] = useState(false);
  const [coveredAreas, setCoveredAreas] = useState(() => {
    const saved = localStorage.getItem("mind-chat-areas");
    return saved ? JSON.parse(saved) : [];
  });
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  // Persistence
  useEffect(() => {
    localStorage.setItem("mind-chat-messages", JSON.stringify(messages));
    localStorage.setItem("mind-chat-scores", JSON.stringify(scores));
    localStorage.setItem("mind-chat-phase", phase);
    localStorage.setItem("mind-chat-areas", JSON.stringify(coveredAreas));
  }, [messages, scores, phase, coveredAreas]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    const isMockMode = !apiKey || apiKey === "your_api_key_here";

    try {
      let parsed;
      if (isMockMode) {
        // Simulated delay for realistic feel
        await new Promise(resolve => setTimeout(resolve, 1500));
        parsed = getMockResponse(userMsg, coveredAreas);
      } else {
        const apiMessages = newMessages.map(m => ({
          role: m.role, content: m.role === "assistant" ? JSON.stringify({ message: m.content }) : m.content
        }));
        apiMessages[0] = { role: "assistant", content: JSON.stringify({ message: messages[0].content, assessed: [], areas_covered_so_far: [], phase: "conversation" }) };

        const response = await fetch("/api/anthropic", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "dangerously-allow-browser": "true",
          },
          body: JSON.stringify({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1000,
            system: SYSTEM_PROMPT + "\n\n현재까지 평가된 영역과 점수: " + JSON.stringify(scores) + "\n평가 완료 영역 수: " + coveredAreas.length + "/16",
            messages: apiMessages,
          }),
        });

        const data = await response.json();
        const text = data.content?.map(b => b.text || "").join("") || "";

        try {
          const clean = text.replace(/```json|```/g, "").trim();
          parsed = JSON.parse(clean);
        } catch {
          parsed = { message: text, assessed: [], areas_covered_so_far: coveredAreas, phase: "conversation" };
        }
      }

      // Update scores
      if (parsed.assessed && parsed.assessed.length > 0) {
        const newScores = { ...scores };
        parsed.assessed.forEach(a => {
          if (a.area && typeof a.score === "number") {
            newScores[a.area] = a.score;
          }
        });
        setScores(newScores);
      }

      if (parsed.areas_covered_so_far) {
        setCoveredAreas(parsed.areas_covered_so_far);
      }

      if (parsed.phase) {
        setPhase(parsed.phase);
        if (parsed.phase === "complete") {
          setTimeout(() => setShowResult(true), 1500);
        }
      }

      setMessages([...newMessages, { role: "assistant", content: parsed.message || text }]);
    } catch (err) {
      console.error(err);
      setMessages([...newMessages, { role: "assistant", content: "죄송해요, 일시적인 문제가 생겼어요. 다시 말씀해 주실 수 있나요?" }]);
    }

    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Calculate results
  const phqKeys = Object.keys(scores).filter(k => k.startsWith("phq_"));
  const gadKeys = Object.keys(scores).filter(k => k.startsWith("gad_"));
  const phqScore = phqKeys.reduce((s, k) => s + scores[k], 0);
  const gadScore = gadKeys.reduce((s, k) => s + scores[k], 0);
  const phqMax = phqKeys.length * 3;
  const gadMax = gadKeys.length * 3;
  const phqEstimated = phqKeys.length > 0 ? Math.round((phqScore / phqKeys.length) * 9) : 0;
  const gadEstimated = gadKeys.length > 0 ? Math.round((gadScore / gadKeys.length) * 7) : 0;
  const depResult = getDepressionLevel(phqEstimated);
  const anxResult = getAnxietyLevel(gadEstimated);

  const progressCount = coveredAreas.length;
  const progressPct = Math.min(100, (progressCount / 12) * 100);

  return (
    <div style={{
      height: "100vh",
      background: "linear-gradient(170deg, #0c0f1a 0%, #111827 50%, #0f172a 100%)",
      fontFamily: "'Noto Sans KR', sans-serif",
      color: "#e2e8f0",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Ambient */}
      <div style={{ position: "fixed", top: "-15%", right: "-8%", width: 350, height: 350, background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "-10%", left: "-8%", width: 300, height: 300, background: "radial-gradient(circle, rgba(45,212,191,0.05) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />

      {/* Header */}
      <div style={{
        padding: "16px 20px",
        background: "rgba(15, 23, 42, 0.8)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(148,163,184,0.06)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        zIndex: 10,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(45,212,191,0.15))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20,
        }}>🫧</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>마음이</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>마음 상담 도우미</div>
        </div>
        {progressCount > 0 && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>진행도</div>
            <div style={{ width: 80, height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                width: progressPct + "%",
                background: "linear-gradient(90deg, #6366f1, #2dd4bf)",
                transition: "width 0.8s ease",
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            alignItems: "flex-end",
            gap: 8,
          }}>
            {msg.role === "assistant" && (
              <div style={{
                width: 30, height: 30, borderRadius: 10, flexShrink: 0,
                background: "rgba(99,102,241,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14,
              }}>🫧</div>
            )}
            <div style={{
              maxWidth: "75%",
              padding: "12px 16px",
              borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: msg.role === "user"
                ? "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(99,102,241,0.15))"
                : "rgba(30, 41, 59, 0.6)",
              border: msg.role === "user"
                ? "1px solid rgba(99,102,241,0.2)"
                : "1px solid rgba(148,163,184,0.06)",
              fontSize: 14,
              lineHeight: 1.7,
              color: msg.role === "user" ? "#c7d2fe" : "#cbd5e1",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              {msg.role === "user" ? msg.content : msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 10, flexShrink: 0,
              background: "rgba(99,102,241,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14,
            }}>🫧</div>
            <div style={{
              padding: "12px 18px",
              borderRadius: "16px 16px 16px 4px",
              background: "rgba(30, 41, 59, 0.6)",
              border: "1px solid rgba(148,163,184,0.06)",
            }}>
              <TypingIndicator />
            </div>
          </div>
        )}

        {/* Result Card */}
        {showResult && (
          <div style={{
            background: "rgba(15, 23, 42, 0.8)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(148,163,184,0.1)",
            borderRadius: 20,
            padding: "28px 24px",
            margin: "8px 0",
            animation: "fadeUp 0.6s ease",
          }}>
            <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }`}</style>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
              <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 20, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
                대화 기반 마음 분석 결과
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                {progressCount}개 영역 탐색 · 대화 내용 기반 추정
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 32, marginBottom: 24 }}>
              {phqKeys.length > 0 && <GaugeRing score={phqEstimated} max={27} color={depResult.color} label="우울 (추정)" />}
              {gadKeys.length > 0 && <GaugeRing score={gadEstimated} max={21} color={getAnxietyLevel(gadEstimated).color} label="불안 (추정)" />}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {phqKeys.length > 0 && (
                <div style={{ background: depResult.bg, border: `1px solid ${depResult.color}22`, borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span>{depResult.emoji}</span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>우울: {depResult.level}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: depResult.color, fontWeight: 600 }}>추정 {phqEstimated}점</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                    탐색 영역: {phqKeys.map(k => AREA_LABELS[k]).join(", ")}
                  </div>
                </div>
              )}
              {gadKeys.length > 0 && (
                <div style={{ background: getAnxietyLevel(gadEstimated).bg, border: `1px solid ${getAnxietyLevel(gadEstimated).color}22`, borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span>{getAnxietyLevel(gadEstimated).emoji}</span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>불안: {getAnxietyLevel(gadEstimated).level}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: getAnxietyLevel(gadEstimated).color, fontWeight: 600 }}>추정 {gadEstimated}점</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                    탐색 영역: {gadKeys.map(k => AREA_LABELS[k]).join(", ")}
                  </div>
                </div>
              )}
            </div>

            {/* Per-area breakdown */}
            <details style={{ marginBottom: 16 }}>
              <summary style={{ cursor: "pointer", color: "#94a3b8", fontSize: 12, padding: "6px 0" }}>
                영역별 상세 점수 보기
              </summary>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {Object.entries(scores).map(([k, v]) => (
                  <div key={k} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "6px 8px", fontSize: 12, color: "#94a3b8",
                  }}>
                    <span style={{ width: 80, flexShrink: 0, color: "#cbd5e1" }}>{AREA_LABELS[k]}</span>
                    <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 2, transition: "width 0.6s ease",
                        width: ((v / 3) * 100) + "%",
                        background: v === 0 ? "#4ade80" : v === 1 ? "#a3e635" : v === 2 ? "#facc15" : "#ef4444",
                      }} />
                    </div>
                    <span style={{ width: 20, textAlign: "right", fontWeight: 600, fontSize: 11,
                      color: v === 0 ? "#4ade80" : v === 1 ? "#a3e635" : v === 2 ? "#facc15" : "#ef4444",
                    }}>{v}/3</span>
                  </div>
                ))}
              </div>
            </details>

            <div style={{
              background: "rgba(99, 102, 241, 0.06)",
              border: "1px solid rgba(99, 102, 241, 0.12)",
              borderRadius: 10, padding: "12px 14px",
              fontSize: 11, color: "#94a3b8", lineHeight: 1.7,
            }}>
              ⓘ 이 결과는 대화 내용에서 추정한 것으로, 정식 심리검사 결과가 아닙니다. 참고 목적으로만 활용하시고, 걱정되시면 전문가 상담을 권장드립니다.
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{
        padding: "12px 16px 16px",
        background: "rgba(15, 23, 42, 0.8)",
        backdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(148,163,184,0.06)",
      }}>
        {phase === "complete" && showResult ? (
          <button
            onClick={() => {
              localStorage.clear();
              setMessages([{ role: "assistant", content: "안녕하세요 😊 저는 마음 상담 도우미 '마음이'예요.\n\n오늘의 기분은 어떠세요?" }]);
              setScores({});
              setCoveredAreas([]);
              setPhase("conversation");
              setShowResult(false);
            }}
            style={{
              width: "100%",
              background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(45,212,191,0.15))",
              border: "1px solid rgba(99,102,241,0.2)",
              borderRadius: 12, padding: "14px",
              cursor: "pointer", color: "#e2e8f0",
              fontSize: 14, fontWeight: 500,
              fontFamily: "'Noto Sans KR', sans-serif",
            }}
          >
            새로운 대화 시작하기
          </button>
        ) : (
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-end",
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="편하게 이야기해 주세요..."
              rows={1}
              style={{
                flex: 1,
                background: "rgba(30, 41, 59, 0.6)",
                border: "1px solid rgba(148,163,184,0.1)",
                borderRadius: 14,
                padding: "12px 16px",
                color: "#e2e8f0",
                fontSize: 14,
                fontFamily: "'Noto Sans KR', sans-serif",
                resize: "none",
                outline: "none",
                lineHeight: 1.5,
                maxHeight: 120,
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => e.target.style.borderColor = "rgba(99,102,241,0.3)"}
              onBlur={(e) => e.target.style.borderColor = "rgba(148,163,184,0.1)"}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              style={{
                width: 44, height: 44, borderRadius: 12,
                background: input.trim() && !loading
                  ? "linear-gradient(135deg, #6366f1, #4f46e5)"
                  : "rgba(30, 41, 59, 0.6)",
                border: "none",
                cursor: input.trim() && !loading ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s", flexShrink: 0,
                opacity: input.trim() && !loading ? 1 : 0.4,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

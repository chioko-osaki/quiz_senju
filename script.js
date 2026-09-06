/* =========================================================
   千手観音クイズ - script.js
   ----------------------------------------------------------
   このファイルには「クイズの動かし方」だけを書いています。
   問題文・選択肢・正解・解説などのクイズの中身は
   すべて questions.json に書かれています。
   問題を変更したいときは、このファイルではなく
   questions.json を編集してください。
   ========================================================= */

(() => {
  "use strict";

  /* ---------------------------------------------------------
     0. 画面上の要素をまとめて取得しておく
  --------------------------------------------------------- */
  const el = {
    // スタート画面
    screenStart: document.getElementById("screen-start"),
    quizTitle: document.getElementById("quiz-title"),
    startDescription: document.getElementById("start-description"),
    btnStart: document.getElementById("btn-start"),

    // 問題画面
    screenQuestion: document.getElementById("screen-question"),
    progressText: document.getElementById("progress-text"),
    progressFill: document.getElementById("progress-fill"),
    questionText: document.getElementById("question-text"),
    choices: document.getElementById("choices"),

    // 正誤画面
    screenFeedback: document.getElementById("screen-feedback"),
    feedbackBadge: document.getElementById("feedback-badge"),
    feedbackCorrectAnswer: document.getElementById("feedback-correct-answer"),
    feedbackExplanation: document.getElementById("feedback-explanation"),
    btnNext: document.getElementById("btn-next"),

    // 結果画面
    screenResult: document.getElementById("screen-result"),
    confettiLayer: document.getElementById("confetti-layer"),
    resultScore: document.getElementById("result-score"),
    resultMessage: document.getElementById("result-message"),
    ctaHeading: document.getElementById("cta-heading"),
    ctaMessage: document.getElementById("cta-message"),
    btnRestart: document.getElementById("btn-restart"),

    loadError: document.getElementById("load-error"),
  };

  // クイズ全体のデータと、いま何問目かなどの状態を保存する場所
  let quizData = null;
  let currentIndex = 0;
  let score = 0;
  let answered = false; // 現在の問題にすでに回答したかどうか

  /* ---------------------------------------------------------
     1. ふりがな(ルビ)変換まわり
     「漢字(ふりがな)」という書き方を <ruby> タグに変換します。
     例: 木造千手観音坐像(もくぞうせんじゅかんのんざぞう)
         → 木造千手観音坐像 の上に もくぞうせんじゅかんのんざぞう
  --------------------------------------------------------- */

  // まず必ずHTMLエスケープしてから変換することで、
  // JSONの中に不正なHTMLが書かれていても安全に表示できるようにする
  function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 漢字(ひらがな/カタカナ) のパターンを <ruby> に置き換える
  // 対象: 漢字・々・ヶ など + ( ふりがな:ひらがな/カタカナ/ー )
  const RUBY_PATTERN = /([\u4E00-\u9FFF\u3005\u303B]+)\(([\u3040-\u309F\u30A0-\u30FFー]+)\)/g;

  function rubyify(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(RUBY_PATTERN, "<ruby>$1<rt>$2</rt></ruby>");
  }

  // rubyify した文字列を、安全に要素の中身として設定するための関数
  function setRubyHTML(element, text) {
    element.innerHTML = rubyify(text);
  }

  /* ---------------------------------------------------------
     2. SE(効果音)まわり
     ファイルが存在しなくても、エラーでクイズが止まらないようにする
  --------------------------------------------------------- */
  function playSound(key) {
    try {
      const soundPath = quizData && quizData.sounds ? quizData.sounds[key] : null;
      if (!soundPath) return; // 設定されていなければ何もしない

      const audio = new Audio(soundPath);
      audio.volume = 0.8;
      // 再生に失敗しても(ファイルが無い/自動再生制限など)無視する
      audio.addEventListener("error", () => {});
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } catch (e) {
      // 万が一の例外もクイズを止めないよう握りつぶす
    }
  }

  /* ---------------------------------------------------------
     3. 画面切り替え
  --------------------------------------------------------- */
  function showScreen(screenElement) {
    [el.screenStart, el.screenQuestion, el.screenFeedback, el.screenResult].forEach((s) => {
      s.hidden = s !== screenElement;
    });
  }

  /* ---------------------------------------------------------
     4. データの読み込み
  --------------------------------------------------------- */
  async function loadQuizData() {
    const response = await fetch("questions.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("questions.json の読み込みに失敗しました");
    }
    return response.json();
  }

  function renderStartScreen() {
    const title = quizData.quizTitle || "クイズ";
    document.title = title.replace(/\([^)]*\)/g, ""); // タブのタイトルはふりがな無し表記
    setRubyHTML(el.quizTitle, title);

    const totalCount = quizData.questions.length;
    const rawDescription =
      (quizData.startScreen && quizData.startScreen.description) || "";
    const description = rawDescription.replace(/\{questionCount\}/g, String(totalCount));
    setRubyHTML(el.startDescription, description);
  }

  /* ---------------------------------------------------------
     5. 問題画面の描画
  --------------------------------------------------------- */
  function renderQuestion() {
    answered = false;
    const total = quizData.questions.length;
    const questionNumber = currentIndex + 1;
    const question = quizData.questions[currentIndex];

    // 進捗表示
    el.progressText.textContent = `第${questionNumber}問 / 全${total}問`;
    el.progressFill.style.width = `${(currentIndex / total) * 100}%`;

    // 問題文
    setRubyHTML(el.questionText, question.question);

    // 選択肢を作り直す
    el.choices.innerHTML = "";
    const letters = ["A", "B", "C", "D", "E", "F"]; // 3択が基本だが将来の拡張にも耐えられるように

    question.choices.forEach((choice, choiceIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-btn";
      button.dataset.choiceIndex = String(choiceIndex);

      // 画像(設定されている場合のみ表示。無い/読み込み失敗時はテキストのみ)
      if (choice.image) {
        const img = document.createElement("img");
        img.className = "choice-image";
        img.src = choice.image;
        img.alt = "";
        img.addEventListener("error", () => {
          img.remove(); // 画像が無ければ静かに消す。レイアウトは崩れない
        });
        button.appendChild(img);
      }

      const label = document.createElement("span");
      label.className = "choice-label";

      const letterBadge = document.createElement("span");
      letterBadge.className = "choice-letter";
      letterBadge.textContent = letters[choiceIndex] || "?";
      label.appendChild(letterBadge);

      const textSpan = document.createElement("span");
      setRubyHTML(textSpan, choice.text);
      label.appendChild(textSpan);

      button.appendChild(label);

      button.addEventListener("click", () => handleChoiceClick(choiceIndex));
      el.choices.appendChild(button);
    });

    showScreen(el.screenQuestion);
  }

  /* ---------------------------------------------------------
     6. 回答クリック時の処理
  --------------------------------------------------------- */
  function handleChoiceClick(choiceIndex) {
    if (answered) return; // 一度回答したら選び直せない
    answered = true;

    playSound("buttonClick");

    const question = quizData.questions[currentIndex];
    const isCorrect = choiceIndex === question.correct;
    if (isCorrect) score += 1;

    // 見た目の反映:選んだ/選ばなかったボタンに状態を付ける
    const buttons = el.choices.querySelectorAll(".choice-btn");
    buttons.forEach((btn) => {
      btn.disabled = true;
      const idx = Number(btn.dataset.choiceIndex);
      if (idx === question.correct) {
        btn.classList.add("is-correct");
      } else if (idx === choiceIndex) {
        btn.classList.add("is-incorrect");
      } else {
        btn.classList.add("is-unselected");
      }
    });

    playSound(isCorrect ? "correct" : "incorrect");

    // 選んだボタンの色が見えるよう、少しだけ待ってから正誤画面へ
    setTimeout(() => showFeedback(isCorrect), 550);
  }

  /* ---------------------------------------------------------
     7. 正誤画面の描画
  --------------------------------------------------------- */
  function pickRandom(list, fallback) {
    if (Array.isArray(list) && list.length > 0) {
      return list[Math.floor(Math.random() * list.length)];
    }
    return fallback;
  }

  function showFeedback(isCorrect) {
    const question = quizData.questions[currentIndex];
    const feedbackConfig = quizData.feedback || {};

    const badgeText = isCorrect
      ? pickRandom(feedbackConfig.defaultCorrectMessages, "せいかい！")
      : pickRandom(feedbackConfig.defaultIncorrectMessages, "おしい！");

    el.feedbackBadge.textContent = badgeText;
    el.feedbackBadge.classList.remove("correct", "incorrect");
    el.feedbackBadge.classList.add(isCorrect ? "correct" : "incorrect");
    // アニメーションをやり直すための再起動
    el.feedbackBadge.style.animation = "none";
    void el.feedbackBadge.offsetWidth; // 強制再描画
    el.feedbackBadge.style.animation = "";

    const correctChoice = question.choices[question.correct];
    setRubyHTML(el.feedbackCorrectAnswer, correctChoice.text);

    const explanationText = (question.explanation || "").trim();
    if (explanationText) {
      el.feedbackExplanation.hidden = false;
      el.feedbackExplanation.previousElementSibling.hidden = false;
      setRubyHTML(el.feedbackExplanation, explanationText);
    } else {
      // 解説が空の場合は項目ごと表示しない
      el.feedbackExplanation.hidden = true;
      el.feedbackExplanation.previousElementSibling.hidden = true;
    }

    showScreen(el.screenFeedback);
  }

  /* ---------------------------------------------------------
     8. 「次の問題へ」ボタン
  --------------------------------------------------------- */
  function goToNext() {
    playSound("buttonClick");
    currentIndex += 1;
    if (currentIndex < quizData.questions.length) {
      renderQuestion();
    } else {
      el.progressFill.style.width = "100%";
      showResult();
    }
  }

  /* ---------------------------------------------------------
     9. 結果画面
  --------------------------------------------------------- */
  function pickResultMessage(rate) {
    const rules = (quizData.resultScreen && quizData.resultScreen.messagesByScoreRate) || [];
    const sorted = [...rules].sort((a, b) => b.minRate - a.minRate);
    const matched = sorted.find((rule) => rate >= rule.minRate);
    return matched ? matched.message : "";
  }

  function spawnConfetti() {
    el.confettiLayer.innerHTML = "";
    const colors = ["#1F6F76", "#C9962E", "#D1653F", "#2F7D5B"];
    const pieceCount = 26;
    for (let i = 0; i < pieceCount; i += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = `${0.9 + Math.random() * 0.6}s`;
      piece.style.animationDelay = `${Math.random() * 0.3}s`;
      el.confettiLayer.appendChild(piece);
    }
  }

  function showResult() {
    const total = quizData.questions.length;
    const resultConfig = quizData.resultScreen || {};

    const scoreTextTemplate = resultConfig.scoreText || "{total}問中{score}問正解！";
    const scoreText = scoreTextTemplate
      .replace(/\{total\}/g, String(total))
      .replace(/\{score\}/g, String(score));
    setRubyHTML(el.resultScore, scoreText);

    const rate = total > 0 ? score / total : 0;
    const message = pickResultMessage(rate);
    setRubyHTML(el.resultMessage, message);

    const cta = resultConfig.callToAction || {};
    setRubyHTML(el.ctaHeading, cta.heading || "");
    setRubyHTML(el.ctaMessage, cta.message || "");

    el.btnRestart.textContent = resultConfig.restartButtonText || "もう一度挑戦する";

    spawnConfetti();
    playSound("finish");
    showScreen(el.screenResult);
  }

  /* ---------------------------------------------------------
     10. スタート・リスタート
  --------------------------------------------------------- */
  function startQuiz() {
    playSound("buttonClick");
    currentIndex = 0;
    score = 0;
    renderQuestion();
  }

  /* ---------------------------------------------------------
     11. 初期化
  --------------------------------------------------------- */
  async function init() {
    try {
      quizData = await loadQuizData();

      if (!Array.isArray(quizData.questions) || quizData.questions.length === 0) {
        throw new Error("questions.json に問題データがありません");
      }

      renderStartScreen();
      showScreen(el.screenStart);

      el.btnStart.addEventListener("click", startQuiz);
      el.btnNext.addEventListener("click", goToNext);
      el.btnRestart.addEventListener("click", startQuiz);
    } catch (error) {
      // JSONの読み込みや内容に問題があった場合、画面を止めずにエラー表示だけ出す
      console.error(error);
      el.loadError.hidden = false;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();

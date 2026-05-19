import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  onSnapshot,
  deleteDoc,
  updateDoc,
  setDoc,
  doc,
  serverTimestamp,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

/* =========================================================
   FIREBASE
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyCcsHXswRQuPLWU2CuoNO5KhxwJNHcY64w",
  authDomain: "copa-fifa.firebaseapp.com",
  projectId: "copa-fifa",
  storageBucket: "copa-fifa.firebasestorage.app",
  messagingSenderId: "262804395487",
  appId: "1:262804395487:web:c8b799632328990616606a",
  measurementId: "G-ZD0PHVL5KG"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* =========================================================
   CONFIGURAÇÃO DA SALA / CAMPEONATO
   Link público:
   index.html?id=TESTE123

   Link admin:
   index.html?id=TESTE123&admin=1
========================================================= */

const urlParams = new URLSearchParams(window.location.search);
const campeonatoCodigo = urlParams.get("id") || "TESTE123";
const pediuAdmin = urlParams.get("admin") === "1";

let isAdmin = false;
let campeonatoDocId = null;
let campeonatoData = null;
let limiteJogadores = 16;

/* =========================================================
   ELEMENTOS HTML
========================================================= */

const playerInput = document.getElementById("playerName");
const addPlayerBtn = document.getElementById("addPlayerBtn");
const drawBtn = document.getElementById("drawBtn");
const resetBtn = document.getElementById("resetBtn");

const playerList = document.getElementById("playerList");
const playerCount = document.getElementById("playerCount");

const mainBracket = document.getElementById("mainBracket");
const loserBracket = document.getElementById("loserBracket");

const mainChampion = document.getElementById("mainChampion");
const loserChampion = document.getElementById("loserChampion");

/* =========================================================
   ESTADO LOCAL
========================================================= */

let players = [];
let playerDocs = [];
let partidas = [];
let estado = null;
let unsubJogadores = null;
let unsubPartidas = null;
let unsubEstado = null;

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

init();

async function init() {
  await carregarCampeonato();

  configurarModo();

  escutarJogadores();
  escutarPartidas();
  escutarEstado();

  addPlayerBtn.addEventListener("click", addPlayer);
  drawBtn.addEventListener("click", startTournament);
  resetBtn.addEventListener("click", resetTournament);

  playerInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addPlayer();
  });
}

async function carregarCampeonato() {
  const campeonatosQuery = query(
    collection(db, "campeonatos"),
    where("codigo", "==", campeonatoCodigo)
  );

  const snapshot = await getDocs(campeonatosQuery);

  if (snapshot.empty) {
    alert(`Campeonato ${campeonatoCodigo} não encontrado.`);
    return;
  }

  const documento = snapshot.docs[0];

  campeonatoDocId = documento.id;
  campeonatoData = documento.data();
  limiteJogadores = campeonatoData.maxJogadores || 16;

  if (pediuAdmin) {
    const senha = prompt("Digite a senha do organizador:");

    if (senha === campeonatoData.senha) {
      isAdmin = true;
    } else {
      alert("Senha incorreta. Você entrou apenas como visualizador.");
      isAdmin = false;
    }
  }
}

function configurarModo() {
  if (isAdmin) {
    drawBtn.style.display = "inline-block";
    resetBtn.style.display = "inline-block";
    addPlayerBtn.textContent = "Adicionar";
    return;
  }

  drawBtn.style.display = "none";
  resetBtn.style.display = "none";
}

/* =========================================================
   QUERIES
========================================================= */

function jogadoresQuery() {
  return query(
    collection(db, "jogadores"),
    where("campeonatoCodigo", "==", campeonatoCodigo)
  );
}

function partidasQuery() {
  return query(
    collection(db, "partidas"),
    where("campeonatoCodigo", "==", campeonatoCodigo)
  );
}

function estadoRef() {
  return doc(db, "estadosCampeonato", campeonatoCodigo);
}

/* =========================================================
   ESCUTAS REALTIME
========================================================= */

function escutarJogadores() {
  if (unsubJogadores) unsubJogadores();

  unsubJogadores = onSnapshot(jogadoresQuery(), (snapshot) => {
    playerDocs = [];
    players = [];

    snapshot.forEach((documento) => {
      const data = documento.data();

      playerDocs.push({
        id: documento.id,
        nome: data.nome,
        criadoEm: data.criadoEm || null
      });
    });

    playerDocs.sort((a, b) => {
      const aTime = a.criadoEm?.seconds || 0;
      const bTime = b.criadoEm?.seconds || 0;
      return aTime - bTime;
    });

    players = playerDocs.map((player) => player.nome);

    renderPlayers();
  });
}

function escutarPartidas() {
  if (unsubPartidas) unsubPartidas();

  unsubPartidas = onSnapshot(partidasQuery(), (snapshot) => {
    partidas = [];

    snapshot.forEach((documento) => {
      partidas.push({
        id: documento.id,
        ...documento.data()
      });
    });

    partidas.sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo.localeCompare(b.tipo);
      if (a.rodada !== b.rodada) return a.rodada - b.rodada;
      return a.numero - b.numero;
    });

    renderPartidas();
  });
}

function escutarEstado() {
  if (unsubEstado) unsubEstado();

  unsubEstado = onSnapshot(estadoRef(), (snapshot) => {
    if (!snapshot.exists()) {
      estado = null;
      return;
    }

    estado = snapshot.data();

    if (estado?.campeaoOficial) {
      mainChampion.textContent = estado.campeaoOficial;
    }

    if (estado?.campeaoRepescagem) {
      loserChampion.textContent = estado.campeaoRepescagem;
    }
  });
}

/* =========================================================
   CRUD JOGADORES
========================================================= */

async function addPlayer() {
  const name = playerInput.value.trim();

  if (!name) return;

  if (estado?.status === "em_andamento" || estado?.status === "finalizado") {
    alert("O campeonato já começou. Não é possível entrar agora.");
    return;
  }

  if (players.length >= limiteJogadores) {
    alert(`Limite de ${limiteJogadores} jogadores atingido.`);
    return;
  }

  const exists = players.some(
    (player) => player.toLowerCase() === name.toLowerCase()
  );

  if (exists) {
    alert("Esse jogador já foi adicionado.");
    return;
  }

  await addDoc(collection(db, "jogadores"), {
    nome: name,
    campeonatoCodigo,
    criadoEm: serverTimestamp()
  });

  playerInput.value = "";
}

async function editPlayer(id, currentName) {
  if (!isAdmin) return;

  if (estado?.status === "em_andamento" || estado?.status === "finalizado") {
    alert("O campeonato já começou. Não é possível editar jogadores.");
    return;
  }

  const newName = prompt("Editar nome do jogador:", currentName);

  if (!newName) return;

  const cleanName = newName.trim();

  if (!cleanName) return;

  const exists = players.some(
    (player) =>
      player.toLowerCase() === cleanName.toLowerCase() &&
      player.toLowerCase() !== currentName.toLowerCase()
  );

  if (exists) {
    alert("Já existe um jogador com esse nome.");
    return;
  }

  await updateDoc(doc(db, "jogadores", id), {
    nome: cleanName
  });
}

async function removePlayer(id) {
  if (!isAdmin) return;

  if (estado?.status === "em_andamento" || estado?.status === "finalizado") {
    alert("O campeonato já começou. Não é possível remover jogadores.");
    return;
  }

  const confirmDelete = confirm("Deseja remover este jogador?");

  if (!confirmDelete) return;

  await deleteDoc(doc(db, "jogadores", id));
}

function renderPlayers() {
  playerList.innerHTML = "";

  playerDocs.forEach((player, index) => {
    const li = document.createElement("li");

    if (isAdmin) {
      li.innerHTML = `
        <span>${index + 1}. ${player.nome}</span>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="edit-player-btn">Editar</button>
          <button class="remove-player-btn">Remover</button>
        </div>
      `;

      li.querySelector(".edit-player-btn").addEventListener("click", () => {
        editPlayer(player.id, player.nome);
      });

      li.querySelector(".remove-player-btn").addEventListener("click", () => {
        removePlayer(player.id);
      });
    } else {
      li.innerHTML = `<span>${index + 1}. ${player.nome}</span>`;
    }

    playerList.appendChild(li);
  });

  playerCount.textContent = `${players.length}/${limiteJogadores} jogadores`;
}

/* =========================================================
   FUNÇÕES BASE DO TORNEIO
========================================================= */

function shuffle(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[randomIndex]] = [copy[randomIndex], copy[i]];
  }

  return copy;
}

function createMatches(queue) {
  const matches = [];
  const byes = [];

  for (let i = 0; i < queue.length; i += 2) {
    const player1 = queue[i];
    const player2 = queue[i + 1];

    if (!player2) {
      byes.push(player1);
    } else {
      matches.push({
        player1,
        player2
      });
    }
  }

  return { matches, byes };
}

function getLastMainRound() {
  const rounds = Object.keys(estado?.losersByMainRound || {}).map(Number);
  if (rounds.length === 0) return 0;
  return Math.max(...rounds);
}

async function salvarEstado(novoEstado) {
  await setDoc(
    estadoRef(),
    {
      ...(estado || {}),
      ...novoEstado,
      campeonatoCodigo,
      atualizadoEm: serverTimestamp()
    },
    { merge: true }
  );
}

async function limparPartidasDoCampeonato() {
  const snapshot = await getDocs(partidasQuery());

  for (const documento of snapshot.docs) {
    await deleteDoc(doc(db, "partidas", documento.id));
  }
}

async function criarPartidas(tipo, rodada, matches) {
  let numero = 1;

  for (const match of matches) {
    await addDoc(collection(db, "partidas"), {
      campeonatoCodigo,
      tipo,
      rodada,
      numero,
      jogador1: match.player1,
      jogador2: match.player2,
      golsJogador1: null,
      golsJogador2: null,
      vencedor: null,
      perdedor: null,
      finalizada: false,
      criadoEm: serverTimestamp()
    });

    numero++;
  }
}

/* =========================================================
   INICIAR TORNEIO
========================================================= */

async function startTournament() {
  if (!isAdmin) {
    alert("Apenas o organizador pode sortear o campeonato.");
    return;
  }

  if (players.length < 2) {
    alert("Adicione pelo menos 2 jogadores.");
    return;
  }

  const confirmar = confirm("Deseja iniciar o campeonato?");

  if (!confirmar) return;

  await limparPartidasDoCampeonato();

  const filaInicial = shuffle(players);

  await salvarEstado({
    status: "em_andamento",
    mainQueue: filaInicial,
    mainRound: 1,
    loserRound: 1,
    currentMainWinners: [],
    currentLoserWinners: [],
    losersByMainRound: {},
    repescagemSurvivors: [],
    campeaoOficial: null,
    campeaoRepescagem: null
  });

  await criarRodadaPrincipal({
    mainQueue: filaInicial,
    mainRound: 1,
    losersByMainRound: {}
  });
}

/* =========================================================
   CHAVE PRINCIPAL
========================================================= */

async function criarRodadaPrincipal(state) {
  const fila = state.mainQueue;
  const rodada = state.mainRound;

  if (fila.length === 1) {
    const campeao = fila[0];

    await salvarEstado({
      campeaoOficial: campeao,
      statusPrincipal: "finalizado"
    });

    if (campeonatoDocId) {
      await updateDoc(doc(db, "campeonatos", campeonatoDocId), {
        campeaoOficial: campeao
      });
    }

    await iniciarRepescagem();
    return;
  }

  const { matches, byes } = createMatches(fila);

  await salvarEstado({
    currentMainWinners: byes
  });

  await criarPartidas("principal", rodada, matches);
}

async function confirmarPartidaPrincipal(partida, gols1, gols2) {
  if (gols1 === gols2) {
    alert("Empate não permitido. Defina um vencedor.");
    return;
  }

  const vencedor = gols1 > gols2 ? partida.jogador1 : partida.jogador2;
  const perdedor = gols1 > gols2 ? partida.jogador2 : partida.jogador1;

  await updateDoc(doc(db, "partidas", partida.id), {
    golsJogador1: gols1,
    golsJogador2: gols2,
    vencedor,
    perdedor,
    finalizada: true,
    finalizadaEm: serverTimestamp()
  });

  const estadoAtual = await getEstadoAtual();

  const currentMainWinners = [
    ...(estadoAtual.currentMainWinners || []),
    vencedor
  ];

  const losersByMainRound = {
    ...(estadoAtual.losersByMainRound || {})
  };

  const rodadaAtual = estadoAtual.mainRound;

  if (!losersByMainRound[rodadaAtual]) {
    losersByMainRound[rodadaAtual] = [];
  }

  losersByMainRound[rodadaAtual].push(perdedor);

  await salvarEstado({
    currentMainWinners,
    losersByMainRound
  });

  await tentarAvancarRodadaPrincipal(rodadaAtual);
}

async function tentarAvancarRodadaPrincipal(rodada) {
  const snapshot = await getDocs(
    query(
      collection(db, "partidas"),
      where("campeonatoCodigo", "==", campeonatoCodigo),
      where("tipo", "==", "principal"),
      where("rodada", "==", rodada)
    )
  );

  const partidasRodada = snapshot.docs.map((documento) => ({
    id: documento.id,
    ...documento.data()
  }));

  const todasFinalizadas = partidasRodada.every(
    (partida) => partida.finalizada
  );

  if (!todasFinalizadas) return;

  const estadoAtual = await getEstadoAtual();

  const proximaFila = [...(estadoAtual.currentMainWinners || [])];
  const proximaRodada = rodada + 1;

  await salvarEstado({
    mainQueue: proximaFila,
    mainRound: proximaRodada,
    currentMainWinners: []
  });

  await criarRodadaPrincipal({
    mainQueue: proximaFila,
    mainRound: proximaRodada,
    losersByMainRound: estadoAtual.losersByMainRound || {}
  });
}

/* =========================================================
   REPESCAGEM
========================================================= */

async function iniciarRepescagem() {
  const estadoAtual = await getEstadoAtual();

  await salvarEstado({
    loserRound: 1,
    repescagemSurvivors: [],
    currentLoserWinners: [],
    statusRepescagem: "em_andamento"
  });

  await criarRodadaRepescagem({
    loserRound: 1,
    repescagemSurvivors: [],
    losersByMainRound: estadoAtual.losersByMainRound || {}
  });
}

async function criarRodadaRepescagem(state) {
  const loserRoundAtual = state.loserRound;
  const losersByMainRound = state.losersByMainRound || {};
  const repescagemSurvivorsAtual = state.repescagemSurvivors || [];

  const novosDaPrincipal = losersByMainRound[loserRoundAtual] || [];

  let fila = [];

  if (loserRoundAtual === 1) {
    fila = shuffle(novosDaPrincipal);
  } else {
    fila = shuffle([
      ...repescagemSurvivorsAtual,
      ...novosDaPrincipal
    ]);
  }

  const ultimaRodadaPrincipal = getLastMainRoundFromObject(losersByMainRound);

  if (fila.length === 0) {
    const proximaRodada = loserRoundAtual + 1;

    if (proximaRodada > ultimaRodadaPrincipal) {
      await finalizarRepescagem(repescagemSurvivorsAtual);
      return;
    }

    await salvarEstado({
      loserRound: proximaRodada
    });

    await criarRodadaRepescagem({
      loserRound: proximaRodada,
      repescagemSurvivors: repescagemSurvivorsAtual,
      losersByMainRound
    });

    return;
  }

  if (fila.length === 1 && loserRoundAtual >= ultimaRodadaPrincipal) {
    await finalizarRepescagem(fila);
    return;
  }

  const { matches, byes } = createMatches(fila);

  await salvarEstado({
    currentLoserWinners: byes,
    repescagemSurvivors: [],
    loserRound: loserRoundAtual
  });

  await criarPartidas("repescagem", loserRoundAtual, matches);
}

async function confirmarPartidaRepescagem(partida, gols1, gols2) {
  if (gols1 === gols2) {
    alert("Empate não permitido. Defina um vencedor.");
    return;
  }

  const vencedor = gols1 > gols2 ? partida.jogador1 : partida.jogador2;
  const perdedor = gols1 > gols2 ? partida.jogador2 : partida.jogador1;

  await updateDoc(doc(db, "partidas", partida.id), {
    golsJogador1: gols1,
    golsJogador2: gols2,
    vencedor,
    perdedor,
    finalizada: true,
    finalizadaEm: serverTimestamp()
  });

  const estadoAtual = await getEstadoAtual();

  const currentLoserWinners = [
    ...(estadoAtual.currentLoserWinners || []),
    vencedor
  ];

  await salvarEstado({
    currentLoserWinners
  });

  await tentarAvancarRodadaRepescagem(partida.rodada);
}

async function tentarAvancarRodadaRepescagem(rodada) {
  const snapshot = await getDocs(
    query(
      collection(db, "partidas"),
      where("campeonatoCodigo", "==", campeonatoCodigo),
      where("tipo", "==", "repescagem"),
      where("rodada", "==", rodada)
    )
  );

  const partidasRodada = snapshot.docs.map((documento) => ({
    id: documento.id,
    ...documento.data()
  }));

  const todasFinalizadas = partidasRodada.every(
    (partida) => partida.finalizada
  );

  if (!todasFinalizadas) return;

  const estadoAtual = await getEstadoAtual();

  const sobreviventes = [...(estadoAtual.currentLoserWinners || [])];
  const proximaRodada = rodada + 1;
  const losersByMainRound = estadoAtual.losersByMainRound || {};
  const ultimaRodadaPrincipal = getLastMainRoundFromObject(losersByMainRound);

  await salvarEstado({
    repescagemSurvivors: sobreviventes,
    currentLoserWinners: [],
    loserRound: proximaRodada
  });

  if (proximaRodada > ultimaRodadaPrincipal && sobreviventes.length === 1) {
    await finalizarRepescagem(sobreviventes);
    return;
  }

  if (proximaRodada > ultimaRodadaPrincipal && sobreviventes.length > 1) {
    await criarRodadaFinalRepescagem(sobreviventes, proximaRodada);
    return;
  }

  await criarRodadaRepescagem({
    loserRound: proximaRodada,
    repescagemSurvivors: sobreviventes,
    losersByMainRound
  });
}

async function criarRodadaFinalRepescagem(sobreviventes, rodada) {
  const fila = shuffle(sobreviventes);

  const { matches, byes } = createMatches(fila);

  await salvarEstado({
    currentLoserWinners: byes,
    repescagemSurvivors: [],
    loserRound: rodada
  });

  if (matches.length === 0 && byes.length === 1) {
    await finalizarRepescagem(byes);
    return;
  }

  await criarPartidas("repescagem", rodada, matches);
}

async function finalizarRepescagem(sobreviventes) {
  if (!sobreviventes || sobreviventes.length === 0) return;

  const campeaoRepescagem = sobreviventes[0];

  await salvarEstado({
    campeaoRepescagem,
    statusRepescagem: "finalizado",
    status: "finalizado"
  });

  if (campeonatoDocId) {
    await updateDoc(doc(db, "campeonatos", campeonatoDocId), {
      campeaoRepescagem
    });
  }
}

function getLastMainRoundFromObject(obj) {
  const rounds = Object.keys(obj || {}).map(Number);

  if (rounds.length === 0) return 0;

  return Math.max(...rounds);
}

async function getEstadoAtual() {
  const snapshot = await getDoc(estadoRef());

  if (!snapshot.exists()) return {};

  return snapshot.data();
}

/* =========================================================
   RENDERIZAÇÃO DAS PARTIDAS
========================================================= */

function renderPartidas() {
  mainBracket.innerHTML = "";
  loserBracket.innerHTML = "";

  const principais = partidas.filter((partida) => partida.tipo === "principal");
  const repescagem = partidas.filter((partida) => partida.tipo === "repescagem");

  renderGrupoDePartidas(mainBracket, principais, "principal");
  renderGrupoDePartidas(loserBracket, repescagem, "repescagem");
}

function renderGrupoDePartidas(container, lista, tipo) {
  const rodadas = agruparPorRodada(lista);

  Object.keys(rodadas)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((rodada) => {
      const roundBox = document.createElement("div");
      roundBox.classList.add("round-box");

      const title = document.createElement("h3");

      if (tipo === "principal") {
        title.textContent = `Rodada ${rodada} - Chave Principal`;
      } else {
        title.textContent = `Rodada ${rodada} - Repescagem`;
      }

      roundBox.appendChild(title);

      rodadas[rodada]
        .sort((a, b) => a.numero - b.numero)
        .forEach((partida) => {
          const card = createMatchCardFromDatabase(partida);
          roundBox.appendChild(card);
        });

      container.appendChild(roundBox);
    });
}

function agruparPorRodada(lista) {
  return lista.reduce((acc, partida) => {
    if (!acc[partida.rodada]) {
      acc[partida.rodada] = [];
    }

    acc[partida.rodada].push(partida);

    return acc;
  }, {});
}

function createMatchCardFromDatabase(partida) {
  const card = document.createElement("div");
  card.classList.add("match-card");

  if (partida.finalizada) {
    card.classList.add("finished");
  }

  const title = partida.tipo === "principal"
    ? `Confronto ${partida.numero}`
    : `Repescagem ${partida.numero}`;

  card.innerHTML = `
    <div class="match-title">${title}</div>

    <div class="player-row ${partida.vencedor === partida.jogador1 ? "winner" : ""} ${partida.perdedor === partida.jogador1 ? "loser" : ""}">
      <span>${partida.jogador1}</span>
      ${renderCampoPlacar(partida, 1)}
    </div>

    <div class="player-row ${partida.vencedor === partida.jogador2 ? "winner" : ""} ${partida.perdedor === partida.jogador2 ? "loser" : ""}">
      <span>${partida.jogador2}</span>
      ${renderCampoPlacar(partida, 2)}
    </div>
  `;

  if (partida.finalizada) {
    const result = document.createElement("p");
    result.classList.add("match-result");
    result.textContent = `✅ Vencedor: ${partida.vencedor}`;
    card.appendChild(result);
    return card;
  }

  if (isAdmin) {
    const button = document.createElement("button");
    button.classList.add("winner-btn", "confirm-score-btn");
    button.textContent = "Confirmar Placar";

    button.addEventListener("click", () => {
      const gols1 = Number(card.querySelector(".score-player-1").value);
      const gols2 = Number(card.querySelector(".score-player-2").value);

      if (gols1 === gols2) {
        alert("Empate não permitido. Defina um vencedor.");
        return;
      }

      if (partida.tipo === "principal") {
        confirmarPartidaPrincipal(partida, gols1, gols2);
      } else {
        confirmarPartidaRepescagem(partida, gols1, gols2);
      }
    });

    card.appendChild(button);
  }

  return card;
}

function renderCampoPlacar(partida, jogadorNumero) {
  const valor = jogadorNumero === 1
    ? partida.golsJogador1
    : partida.golsJogador2;

  if (partida.finalizada || !isAdmin) {
    return `<strong>${valor ?? "-"}</strong>`;
  }

  return `
    <input
      class="score-input score-player-${jogadorNumero}"
      type="number"
      min="0"
      value="0"
    />
  `;
}

/* =========================================================
   RESET GERAL
========================================================= */

async function resetTournament() {
  if (!isAdmin) {
    alert("Apenas o organizador pode reiniciar.");
    return;
  }

  const confirmReset = confirm(
    "Deseja reiniciar tudo? Isso apagará jogadores, partidas e resultados deste campeonato."
  );

  if (!confirmReset) return;

  const jogadoresSnapshot = await getDocs(jogadoresQuery());

  for (const documento of jogadoresSnapshot.docs) {
    await deleteDoc(doc(db, "jogadores", documento.id));
  }

  const partidasSnapshot = await getDocs(partidasQuery());

  for (const documento of partidasSnapshot.docs) {
    await deleteDoc(doc(db, "partidas", documento.id));
  }

  await setDoc(estadoRef(), {
    campeonatoCodigo,
    status: "aberto",
    mainQueue: [],
    mainRound: 1,
    loserRound: 1,
    currentMainWinners: [],
    currentLoserWinners: [],
    losersByMainRound: {},
    repescagemSurvivors: [],
    campeaoOficial: null,
    campeaoRepescagem: null,
    atualizadoEm: serverTimestamp()
  });

  if (campeonatoDocId) {
    await updateDoc(doc(db, "campeonatos", campeonatoDocId), {
      campeaoOficial: null,
      campeaoRepescagem: null,
      status: "aberto"
    });
  }

  mainChampion.textContent = "-";
  loserChampion.textContent = "-";
}
    
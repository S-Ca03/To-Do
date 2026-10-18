/* ==========================================================================
   Tareas y notas — lógica
   Dos "mini apps" que comparten el mismo patrón: un array en memoria como
   fuente de verdad, guardado en localStorage y dibujado con render*().
   ========================================================================== */

const CLAVE_TAREAS = "tareas";
const CLAVE_NOTAS = "notas";
const CLAVE_PESTANA = "pestana-activa";
const DURACION_SALIDA = 280; // ms, igual que la transición .saliendo del CSS

/* ---------- Utilidades ---------- */

function leerLista(clave) {
  try {
    return JSON.parse(localStorage.getItem(clave)) || [];
  } catch {
    return [];
  }
}

function calcularSiguienteId(lista) {
  return Math.max(0, ...lista.map((item) => item.id ?? 0)) + 1;
}

// Anima la salida de un elemento y ejecuta alTerminar cuando acaba.
// Fija la altura real antes de colapsar para que sea suave con cualquier
// cantidad de texto.
function animarSalida(elemento, alTerminar) {
  elemento.style.maxHeight = elemento.offsetHeight + "px";
  void elemento.offsetHeight; // fuerza el reflow para que la transición arranque
  elemento.classList.add("saliendo");
  elemento.style.maxHeight = "0px";
  setTimeout(alTerminar, DURACION_SALIDA);
}

/* ==========================================================================
   Pestañas
   ========================================================================== */

const segmentado = document.querySelector(".segmentado");
const pestanas = document.querySelectorAll(".pestana");
const paneles = {
  tareas: document.querySelector("#panel-tareas"),
  notas: document.querySelector("#panel-notas"),
};

function activarPestana(nombre) {
  segmentado.dataset.activa = nombre;

  pestanas.forEach((pestana) => {
    const activa = pestana.dataset.pestana === nombre;
    pestana.setAttribute("aria-selected", activa);
    pestana.tabIndex = activa ? 0 : -1;
  });

  Object.entries(paneles).forEach(([clave, panel]) => {
    panel.hidden = clave !== nombre;
  });

  localStorage.setItem(CLAVE_PESTANA, nombre);
}

pestanas.forEach((pestana) => {
  pestana.addEventListener("click", () => activarPestana(pestana.dataset.pestana));

  // Flechas izquierda/derecha para moverse entre pestañas con teclado
  pestana.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const otra = pestana.dataset.pestana === "tareas" ? "notas" : "tareas";
    activarPestana(otra);
    document.querySelector(`#pestana-${otra}`).focus();
  });
});

/* ==========================================================================
   TAREAS
   ========================================================================== */

const formTarea = document.querySelector("#form-tarea");
const inputTarea = document.querySelector("#input-tarea");
const listaTareas = document.querySelector("#lista-tareas");
const vaciaTareas = document.querySelector("#vacia-tareas");

// Cada tarea es { id, texto, completada }. Si en el navegador había tareas
// en formatos anteriores (solo texto, o sin id), se adaptan al abrir.
let tareas = leerLista(CLAVE_TAREAS).map((tarea) =>
  typeof tarea === "string" ? { texto: tarea, completada: false } : tarea
);
let siguienteIdTarea = calcularSiguienteId(tareas);
tareas.forEach((tarea) => {
  if (tarea.id === undefined) tarea.id = siguienteIdTarea++;
});

let idTareaNueva = null;

function guardarTareas() {
  localStorage.setItem(CLAVE_TAREAS, JSON.stringify(tareas));
}

function renderizarTareas() {
  listaTareas.innerHTML = "";

  tareas.forEach((tarea) => {
    const li = document.createElement("li");
    li.classList.add("tarea");
    li.dataset.id = tarea.id;
    if (tarea.completada) li.classList.add("completada");
    if (tarea.id === idTareaNueva) li.classList.add("nueva");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.classList.add("checkbox-tarea");
    checkbox.checked = tarea.completada;
    checkbox.setAttribute("aria-label", "Marcar como completada");

    const spanTexto = document.createElement("span");
    spanTexto.classList.add("texto-tarea");
    spanTexto.textContent = tarea.texto;

    const btnEliminar = document.createElement("button");
    btnEliminar.type = "button";
    btnEliminar.classList.add("btn-eliminar");
    btnEliminar.textContent = "Eliminar";

    li.append(checkbox, spanTexto, btnEliminar);
    listaTareas.appendChild(li);
  });

  idTareaNueva = null;
  vaciaTareas.hidden = tareas.length > 0;
}

function crearTarea(texto) {
  const nueva = { id: siguienteIdTarea++, texto, completada: false };
  tareas.push(nueva);
  idTareaNueva = nueva.id;
  guardarTareas();
  renderizarTareas();
}

function eliminarTarea(id) {
  tareas = tareas.filter((tarea) => tarea.id !== id);
  guardarTareas();
  renderizarTareas();
}

formTarea.addEventListener("submit", (event) => {
  event.preventDefault();
  const texto = inputTarea.value.trim();

  if (texto === "") {
    alert("Escribe una tarea antes de agregar");
    return;
  }

  crearTarea(texto);
  inputTarea.value = "";
  inputTarea.focus();
});

// Marcar / desmarcar: solo se reasigna la clase "completada" y el CSS
// se encarga del tachado, la opacidad y la animación.
listaTareas.addEventListener("change", (event) => {
  if (!event.target.classList.contains("checkbox-tarea")) return;

  const li = event.target.closest(".tarea");
  const tarea = tareas.find((t) => t.id === Number(li.dataset.id));

  tarea.completada = event.target.checked;
  li.classList.toggle("completada", tarea.completada);
  guardarTareas();
});

listaTareas.addEventListener("click", (event) => {
  if (!event.target.classList.contains("btn-eliminar")) return;

  const li = event.target.closest(".tarea");
  const id = Number(li.dataset.id);
  animarSalida(li, () => eliminarTarea(id));
});

/* ==========================================================================
   NOTAS
   ========================================================================== */

const formNota = document.querySelector("#form-nota");
const inputTitulo = document.querySelector("#input-titulo");
const inputContenido = document.querySelector("#input-contenido");
const contenedorNotas = document.querySelector("#contenedor-notas");
const vaciaNotas = document.querySelector("#vacia-notas");
const btnGuardarNota = document.querySelector("#btn-guardar-nota");
const btnCancelar = document.querySelector("#btn-cancelar");

let notas = leerLista(CLAVE_NOTAS);
let siguienteIdNota = calcularSiguienteId(notas);
let idEnEdicion = null;
let idNotaNueva = null;

function guardarNotas() {
  localStorage.setItem(CLAVE_NOTAS, JSON.stringify(notas));
}

function renderizarNotas() {
  contenedorNotas.innerHTML = "";

  notas.forEach((nota) => {
    const div = document.createElement("div");
    div.classList.add("nota");
    div.dataset.id = nota.id;
    if (nota.id === idNotaNueva) div.classList.add("nueva");
    if (nota.id === idEnEdicion) div.classList.add("editando");

    const h3 = document.createElement("h3");
    h3.textContent = nota.titulo;

    const p = document.createElement("p");
    p.textContent = nota.contenido;

    const acciones = document.createElement("div");
    acciones.classList.add("acciones-nota");

    const btnEditar = document.createElement("button");
    btnEditar.type = "button";
    btnEditar.classList.add("btn-editar");
    btnEditar.textContent = "Editar";

    const btnEliminar = document.createElement("button");
    btnEliminar.type = "button";
    btnEliminar.classList.add("btn-eliminar");
    btnEliminar.textContent = "Eliminar";

    acciones.append(btnEditar, btnEliminar);
    div.append(h3, p, acciones);
    contenedorNotas.appendChild(div);
  });

  idNotaNueva = null;
  vaciaNotas.hidden = notas.length > 0;
}

function crearNota(titulo, contenido) {
  const nueva = { id: siguienteIdNota++, titulo, contenido };
  notas.push(nueva);
  idNotaNueva = nueva.id;
  guardarNotas();
  renderizarNotas();
}

function eliminarNota(id) {
  notas = notas.filter((nota) => nota.id !== id);
  guardarNotas();
  renderizarNotas();
}

function actualizarNota(id, titulo, contenido) {
  notas = notas.map((nota) => (nota.id === id ? { ...nota, titulo, contenido } : nota));
  guardarNotas();
  renderizarNotas();
}

function entrarEnEdicion(nota) {
  idEnEdicion = nota.id;
  inputTitulo.value = nota.titulo;
  inputContenido.value = nota.contenido;
  btnGuardarNota.textContent = "Actualizar nota";
  btnCancelar.hidden = false;
  renderizarNotas(); // para resaltar la nota que se edita
  inputTitulo.focus();
}

function salirDeEdicion() {
  idEnEdicion = null;
  formNota.reset();
  btnGuardarNota.textContent = "Guardar nota";
  btnCancelar.hidden = true;
  renderizarNotas();
}

formNota.addEventListener("submit", (event) => {
  event.preventDefault();
  const titulo = inputTitulo.value.trim();
  const contenido = inputContenido.value.trim();

  if (titulo === "") {
    alert("Escribe un título antes de agregar");
    return;
  }
  if (contenido === "") {
    alert("Escribe una nota antes de agregar");
    return;
  }

  if (idEnEdicion === null) {
    crearNota(titulo, contenido);
    formNota.reset();
  } else {
    actualizarNota(idEnEdicion, titulo, contenido);
    salirDeEdicion();
  }
});

btnCancelar.addEventListener("click", salirDeEdicion);

contenedorNotas.addEventListener("click", (event) => {
  const div = event.target.closest(".nota");
  if (!div) return;
  const id = Number(div.dataset.id);

  if (event.target.classList.contains("btn-editar")) {
    entrarEnEdicion(notas.find((nota) => nota.id === id));
  }

  if (event.target.classList.contains("btn-eliminar")) {
    animarSalida(div, () => {
      // Si se borra justo la nota que se estaba editando, se limpia el formulario
      if (idEnEdicion === id) {
        salirDeEdicion();
      }
      eliminarNota(id);
    });
  }
});

/* ==========================================================================
   Arranque
   ========================================================================== */

guardarTareas(); // persiste la migración de formato, si hubo
renderizarTareas();
renderizarNotas();
activarPestana(localStorage.getItem(CLAVE_PESTANA) === "notas" ? "notas" : "tareas");

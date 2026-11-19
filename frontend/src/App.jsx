import React from 'react';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Beaker, Check, ChevronRight, ClipboardList,
  FlaskConical, LoaderCircle, Plus, RefreshCw, Save, Search, Trash2
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3030').replace(/\/$/, '');
const ORGANIZACION_ID = String(import.meta.env.VITE_ORGANIZACION_ID || '').trim();

const emptyForm = () => ({
  id: null,
  codigo: '',
  producto_id: '',
  rendimiento_cantidad: '1',
  rendimiento_unidad_id: '',
  procedimiento: '',
  observaciones: '',
  detalles: [],
});

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Error HTTP ${response.status}`);
  }
  return payload;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('es-AR').format(date);
}

export default function App() {
  const [catalogos, setCatalogos] = useState({ productos: [], unidades: [] });
  const [formulaciones, setFormulaciones] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [screen, setScreen] = useState('list');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const productosTerminados = useMemo(
    () => catalogos.productos.filter((p) => p.tipo_item === 'PRODUCTO_TERMINADO'),
    [catalogos.productos],
  );
  const materiasPrimas = useMemo(
    () => catalogos.productos.filter((p) => p.tipo_item === 'MATERIA_PRIMA'),
    [catalogos.productos],
  );
  const filteredFormulas = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es-AR');
    if (!term) return formulaciones;
    return formulaciones.filter((item) =>
      [item.codigo, item.producto_codigo, item.producto_nombre, item.estado]
        .some((value) => String(value || '').toLocaleLowerCase('es-AR').includes(term)),
    );
  }, [formulaciones, search]);

  const loadData = useCallback(async () => {
    if (!ORGANIZACION_ID) {
      setLoading(false);
      setError('Falta configurar VITE_ORGANIZACION_ID en frontend/.env.local. No se consultó la API.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [catalog, rows] = await Promise.all([
        apiRequest(`/api/formulaciones/catalogos?organizacion_id=${encodeURIComponent(ORGANIZACION_ID)}`),
        apiRequest(`/api/formulaciones?organizacion_id=${encodeURIComponent(ORGANIZACION_ID)}`),
      ]);
      setCatalogos(catalog);
      setFormulaciones(rows);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function addIngredient() {
    const first = materiasPrimas[0];
    if (!first) {
      setError('No hay materias primas activas cargadas para esta organización.');
      return;
    }
    setForm((current) => ({
      ...current,
      detalles: [
        ...current.detalles,
        {
          materia_prima_id: String(first.id),
          cantidad: '',
          unidad_medida_id: String(first.unidad_base_id || ''),
          observaciones: '',
        },
      ],
    }));
  }

  function updateIngredient(index, field, value) {
    setForm((current) => ({
      ...current,
      detalles: current.detalles.map((item, i) => {
        if (i !== index) return item;
        if (field === 'materia_prima_id') {
          const product = materiasPrimas.find((p) => String(p.id) === String(value));
          return { ...item, materia_prima_id: value, unidad_medida_id: String(product?.unidad_base_id || '') };
        }
        return { ...item, [field]: value };
      }),
    }));
  }

  function removeIngredient(index) {
    setForm((current) => ({
      ...current,
      detalles: current.detalles.filter((_, i) => i !== index),
    }));
  }

  function newFormula() {
    setError('');
    setNotice('');
    setForm(emptyForm());
    setScreen('edit');
  }

  async function editFormula(id) {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const data = await apiRequest(`/api/formulaciones/${id}?organizacion_id=${encodeURIComponent(ORGANIZACION_ID)}`);
      setForm({
        id: data.id,
        codigo: data.codigo || '',
        producto_id: String(data.producto_id || ''),
        rendimiento_cantidad: String(data.rendimiento_cantidad ?? '1'),
        rendimiento_unidad_id: String(data.rendimiento_unidad_id || ''),
        procedimiento: data.procedimiento || '',
        observaciones: data.observaciones || '',
        detalles: (data.detalles || []).map((item) => ({
          materia_prima_id: String(item.materia_prima_id),
          cantidad: String(item.cantidad),
          unidad_medida_id: String(item.unidad_medida_id),
          observaciones: item.observaciones || '',
        })),
      });
      setScreen('edit');
    } catch (err) {
      setError(err.message || 'No se pudo abrir la formulación.');
    } finally {
      setLoading(false);
    }
  }

  async function saveFormula(event) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!ORGANIZACION_ID) {
      setError('Falta configurar la organización en frontend/.env.local.');
      return;
    }
    if (!form.codigo.trim() || !form.producto_id || !form.rendimiento_unidad_id || !form.procedimiento.trim()) {
      setError('Completá código, producto elaborado, rendimiento con unidad y procedimiento.');
      return;
    }
    if (form.detalles.some((item) => !item.materia_prima_id || !item.cantidad || Number(item.cantidad) <= 0 || !item.unidad_medida_id)) {
      setError('Revisá los componentes: cada materia prima debe tener cantidad mayor que cero y unidad.');
      return;
    }

    const payload = {
      organizacion_id: Number(ORGANIZACION_ID),
      codigo: form.codigo.trim(),
      producto_id: Number(form.producto_id),
      rendimiento_cantidad: form.rendimiento_cantidad,
      rendimiento_unidad_id: Number(form.rendimiento_unidad_id),
      procedimiento: form.procedimiento.trim(),
      observaciones: form.observaciones.trim() || null,
      detalles: form.detalles.map((item) => ({
        materia_prima_id: Number(item.materia_prima_id),
        cantidad: item.cantidad,
        unidad_medida_id: Number(item.unidad_medida_id),
        observaciones: item.observaciones.trim() || null,
      })),
    };

    setSaving(true);
    try {
      if (form.id) {
        await apiRequest(`/api/formulaciones/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setNotice('Borrador actualizado correctamente.');
      } else {
        await apiRequest('/api/formulaciones', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice('Borrador creado correctamente.');
      }
      await loadData();
      setScreen('list');
      setForm(emptyForm());
    } catch (err) {
      setError(err.message || 'No se pudo guardar la formulación.');
    } finally {
      setSaving(false);
    }
  }

  const selectedProduct = productosTerminados.find((p) => String(p.id) === String(form.producto_id));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Beaker size={23} strokeWidth={1.8} /></div>
          <div><strong>BURBUJA</strong><span>GESTIÓN INDUSTRIAL</span></div>
        </div>
        <div className="side-label">PRODUCCIÓN</div>
        <div className="side-link active"><FlaskConical size={18} /> Formulaciones</div>
        <div className="side-link muted"><ClipboardList size={18} /> Próximamente: fabricación</div>
        <div className="sidebar-footer"><span className="status-dot" /> Entorno de desarrollo</div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">BURBUJA <ChevronRight size={14} /> PRODUCCIÓN <ChevronRight size={14} /> <b>FORMULACIONES</b></div>
          <div className="topbar-right"><span className="topbar-tag">MÓDULO EN DESARROLLO</span></div>
        </header>

        <section className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">DESARROLLO DE PRODUCTOS</div>
              <h1>{screen === 'list' ? 'Formulaciones' : form.id ? 'Editar formulación' : 'Nueva formulación'}</h1>
              <p>{screen === 'list' ? 'Administrá las composiciones técnicas y sus versiones.' : 'Definí el producto elaborado, sus componentes y el procedimiento.'}</p>
            </div>
            {screen === 'list' ? (
              <button className="primary-button" onClick={newFormula}><Plus size={17} /> Nueva formulación</button>
            ) : (
              <button className="secondary-button" onClick={() => { setScreen('list'); setError(''); }}><ArrowLeft size={17} /> Volver al listado</button>
            )}
          </div>

          {!ORGANIZACION_ID && (
            <div className="config-notice"><AlertCircle size={18} /><div><strong>Configuración pendiente</strong><span>Definí VITE_ORGANIZACION_ID en frontend/.env.local para conectar los datos de una organización.</span></div></div>
          )}
          {error && <div className="alert error-alert"><AlertCircle size={18} /><span>{error}</span><button onClick={() => setError('')} aria-label="Cerrar mensaje">×</button></div>}
          {notice && <div className="alert success-alert"><Check size={18} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Cerrar mensaje">×</button></div>}

          {screen === 'list' ? (
            <section className="panel">
              <div className="panel-toolbar">
                <div><h2>Listado de formulaciones</h2><p>{formulaciones.length} registros encontrados</p></div>
                <div className="toolbar-actions">
                  <div className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código o producto..." /></div>
                  <button className="icon-button" onClick={loadData} title="Actualizar"><RefreshCw size={17} /></button>
                </div>
              </div>
              {loading ? (
                <div className="loading-state"><LoaderCircle className="spin" size={25} /> Cargando formulaciones...</div>
              ) : filteredFormulas.length === 0 ? (
                <div className="empty-state"><div className="empty-icon"><FlaskConical size={25} /></div><h3>{formulaciones.length ? 'No hay coincidencias' : 'Todavía no hay formulaciones'}</h3><p>{formulaciones.length ? 'Probá con otro término de búsqueda.' : 'Creá el primer borrador para comenzar a documentar una composición.'}</p>{!formulaciones.length && <button className="primary-button" onClick={newFormula}><Plus size={17} /> Crear formulación</button>}</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>CÓDIGO / VERSIÓN</th><th>PRODUCTO ELABORADO</th><th>RENDIMIENTO</th><th>ESTADO</th><th>ACTUALIZACIÓN</th><th></th></tr></thead>
                    <tbody>
                      {filteredFormulas.map((item) => (
                        <tr key={item.id}>
                          <td><strong className="code-cell">{item.codigo}</strong><small>Versión {item.version}</small></td>
                          <td><strong>{item.producto_nombre}</strong><small>{item.producto_codigo}</small></td>
                          <td>{item.rendimiento_cantidad} {item.rendimiento_unidad || ''}</td>
                          <td><span className={`state-pill ${String(item.estado).toLowerCase()}`}>{item.estado}</span></td>
                          <td>{formatDate(item.actualizado_en || item.creado_en)}</td>
                          <td><button className="row-action" onClick={() => editFormula(item.id)}>Abrir <ChevronRight size={15} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : (
            <form className="editor-layout" onSubmit={saveFormula}>
              <div className="editor-main">
                <section className="panel form-panel">
                  <div className="section-title"><span className="section-number">01</span><div><h2>Identificación</h2><p>Datos generales de la formulación.</p></div></div>
                  <div className="form-grid">
                    <label className="field"><span>Código de formulación <i>*</i></span><input value={form.codigo} onChange={(e) => updateField('codigo', e.target.value)} maxLength={60} placeholder="Ej.: FORM-001" required /></label>
                    <label className="field"><span>Producto elaborado <i>*</i></span><select value={form.producto_id} onChange={(e) => updateField('producto_id', e.target.value)} required><option value="">Seleccionar producto...</option>{productosTerminados.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>)}</select></label>
                    <label className="field"><span>Rendimiento esperado <i>*</i></span><input type="number" min="0.000001" step="any" value={form.rendimiento_cantidad} onChange={(e) => updateField('rendimiento_cantidad', e.target.value)} required /></label>
                    <label className="field"><span>Unidad del rendimiento <i>*</i></span><select value={form.rendimiento_unidad_id} onChange={(e) => updateField('rendimiento_unidad_id', e.target.value)} required><option value="">Seleccionar unidad...</option>{catalogos.unidades.map((u) => <option key={u.id} value={u.id}>{u.codigo} — {u.nombre}</option>)}</select></label>
                  </div>
                  {selectedProduct && <div className="inline-hint">Producto seleccionado: <strong>{selectedProduct.nombre}</strong> · Unidad base: {selectedProduct.unidad_base_id || 'No informada'}</div>}
                </section>

                <section className="panel form-panel">
                  <div className="section-title section-title-row"><div className="section-title"><span className="section-number">02</span><div><h2>Composición</h2><p>Materias primas y cantidades necesarias.</p></div></div><button type="button" className="outline-button" onClick={addIngredient}><Plus size={16} /> Agregar componente</button></div>
                  {form.detalles.length === 0 ? (
                    <div className="ingredient-empty"><Beaker size={22} /><span>No agregaste materias primas todavía.</span><button type="button" onClick={addIngredient}>Agregar el primer componente</button></div>
                  ) : (
                    <div className="ingredient-list">
                      <div className="ingredient-head"><span>Materia prima</span><span>Cantidad</span><span>Unidad</span><span>Observación</span><span></span></div>
                      {form.detalles.map((item, index) => (
                        <div className="ingredient-row" key={index}>
                          <select aria-label="Materia prima" value={item.materia_prima_id} onChange={(e) => updateIngredient(index, 'materia_prima_id', e.target.value)} required><option value="">Seleccionar...</option>{materiasPrimas.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>)}</select>
                          <input aria-label="Cantidad" type="number" min="0.000001" step="any" value={item.cantidad} onChange={(e) => updateIngredient(index, 'cantidad', e.target.value)} placeholder="0,000" required />
                          <select aria-label="Unidad" value={item.unidad_medida_id} onChange={(e) => updateIngredient(index, 'unidad_medida_id', e.target.value)} required><option value="">Unidad...</option>{catalogos.unidades.map((u) => <option key={u.id} value={u.id}>{u.codigo}</option>)}</select>
                          <input aria-label="Observación" value={item.observaciones} onChange={(e) => updateIngredient(index, 'observaciones', e.target.value)} placeholder="Opcional" />
                          <button type="button" className="delete-button" onClick={() => removeIngredient(index)} aria-label="Quitar componente"><Trash2 size={17} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="formula-footnote">Las cantidades se registran según la unidad seleccionada. La conversión y validación de magnitudes se controlan en el backend.</div>
                </section>

                <section className="panel form-panel">
                  <div className="section-title"><span className="section-number">03</span><div><h2>Procedimiento de elaboración</h2><p>Documentá las instrucciones técnicas de preparación.</p></div></div>
                  <label className="field"><span>Procedimiento <i>*</i></span><textarea value={form.procedimiento} onChange={(e) => updateField('procedimiento', e.target.value)} rows={7} maxLength={20000} placeholder="Describí las etapas del procedimiento, parámetros y controles previstos..." required /></label>
                  <label className="field spaced-field"><span>Observaciones generales</span><textarea value={form.observaciones} onChange={(e) => updateField('observaciones', e.target.value)} rows={3} placeholder="Notas internas de la formulación..." /></label>
                </section>
              </div>

              <aside className="editor-aside">
                <section className="panel side-panel">
                  <h3>Estado del documento</h3>
                  <span className="state-pill borrador">BORRADOR</span>
                  <p>Esta pantalla permite crear y editar borradores. La validación técnica y la liberación de una fórmula requieren un flujo específico que todavía no está implementado.</p>
                  <div className="side-divider" />
                  <div className="side-summary"><span>Componentes</span><strong>{form.detalles.length}</strong></div>
                  <div className="side-summary"><span>Producto</span><strong>{selectedProduct?.codigo || 'Sin seleccionar'}</strong></div>
                </section>
                <div className="safety-note"><AlertCircle size={17} /><p>Registrar una fórmula no certifica que el producto sea hipoalergénico ni reemplaza los controles de calidad, seguridad y requisitos regulatorios.</p></div>
                <button className="primary-button save-button" type="submit" disabled={saving}><Save size={17} /> {saving ? 'Guardando...' : 'Guardar borrador'}</button>
                <button className="secondary-button cancel-button" type="button" onClick={() => { setScreen('list'); setError(''); }}>Cancelar</button>
              </aside>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

-- ============================================================
-- NÓMINA DE OBRAS — Script SQL para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. OBRAS
create table if not exists obras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activa boolean default true,
  created_at timestamptz default now()
);

insert into obras (nombre) values
  ('SILVANA'),
  ('LUCIA'),
  ('TOWN HOUSES'),
  ('GYM LA BENTON'),
  ('BANORTE MONTERREY'),
  ('BANORTE LOS CABOS'),
  ('OFICINA');

-- 2. USUARIOS (roles: residente, superintendente, nominas)
create table if not exists usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol text not null check (rol in ('residente','superintendente','nominas')),
  created_at timestamptz default now()
);

-- 3. ASIGNACIONES residente → obra(s)
create table if not exists asignaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references usuarios(id) on delete cascade,
  obra_id uuid references obras(id) on delete cascade,
  unique(usuario_id, obra_id)
);

-- 4. TRABAJADORES
create table if not exists trabajadores (
  id uuid primary key default gen_random_uuid(),
  num_empleado text,
  nombre text not null,
  puesto text,
  obra_id uuid references obras(id),
  forma_pago text default 'TRANSFERENCIA',
  sueldo_semanal numeric(10,2) default 0,
  tiene_bono boolean default false,
  monto_bono numeric(10,2) default 0,
  activo boolean default true,
  created_at timestamptz default now()
);

-- 5. SEMANAS DE NÓMINA
create table if not exists semanas (
  id uuid primary key default gen_random_uuid(),
  semana_num text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  estado text default 'abierta' check (estado in ('abierta','cerrada')),
  created_at timestamptz default now()
);

-- 6. NÓMINA POR OBRA (una por residente por semana)
create table if not exists nominas_obra (
  id uuid primary key default gen_random_uuid(),
  semana_id uuid references semanas(id),
  obra_id uuid references obras(id),
  residente_id uuid references usuarios(id),
  estado text default 'borrador' check (estado in ('borrador','enviada','aprobada','rechazada')),
  comentario_rechazo text,
  enviada_at timestamptz,
  aprobada_at timestamptz,
  created_at timestamptz default now(),
  unique(semana_id, obra_id)
);

-- 7. DETALLE DE ASISTENCIA POR TRABAJADOR
create table if not exists asistencias (
  id uuid primary key default gen_random_uuid(),
  nomina_obra_id uuid references nominas_obra(id) on delete cascade,
  trabajador_id uuid references trabajadores(id),
  -- dias: 1 = trabajó, 0 = falta, 0.5 = medio día
  viernes numeric(3,1) default 0,
  sabado numeric(3,1) default 0,
  domingo numeric(3,1) default 0,
  lunes numeric(3,1) default 0,
  martes numeric(3,1) default 0,
  miercoles numeric(3,1) default 0,
  jueves numeric(3,1) default 0,
  dias_total numeric(4,1) default 0,
  horas_extra numeric(5,1) default 0,
  prestamos numeric(10,2) default 0,
  -- calculados automáticamente
  bono_aplicado numeric(10,2) default 0,
  subtotal numeric(10,2) default 0,
  total_pagar numeric(10,2) default 0,
  created_at timestamptz default now(),
  unique(nomina_obra_id, trabajador_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table obras enable row level security;
alter table usuarios enable row level security;
alter table asignaciones enable row level security;
alter table trabajadores enable row level security;
alter table semanas enable row level security;
alter table nominas_obra enable row level security;
alter table asistencias enable row level security;

-- Todos pueden leer obras activas
create policy "obras_read" on obras for select using (activa = true);

-- Usuarios ven su propio perfil
create policy "usuarios_read_own" on usuarios for select using (id = auth.uid());

-- Superintendente y nóminas ven todos los usuarios
create policy "usuarios_read_all" on usuarios for select
  using (exists (
    select 1 from usuarios u where u.id = auth.uid()
    and u.rol in ('superintendente','nominas')
  ));

-- Asignaciones: residente ve las suyas; super/nominas ven todas
create policy "asignaciones_read" on asignaciones for select
  using (
    usuario_id = auth.uid()
    or exists (
      select 1 from usuarios u where u.id = auth.uid()
      and u.rol in ('superintendente','nominas')
    )
  );

-- Trabajadores: residente ve solo los de sus obras; super/nominas ven todos
create policy "trabajadores_read_residente" on trabajadores for select
  using (
    exists (
      select 1 from asignaciones a
      join usuarios u on u.id = a.usuario_id
      where a.obra_id = trabajadores.obra_id
      and a.usuario_id = auth.uid()
      and u.rol = 'residente'
    )
    or exists (
      select 1 from usuarios u where u.id = auth.uid()
      and u.rol in ('superintendente','nominas')
    )
  );

-- Semanas: todos pueden leer
create policy "semanas_read" on semanas for select using (true);
create policy "semanas_write" on semanas for insert
  using (exists (select 1 from usuarios u where u.id = auth.uid() and u.rol in ('superintendente','nominas')));

-- Nóminas obra: residente ve/edita las suyas mientras borrador; super ve todas
create policy "nominas_read" on nominas_obra for select
  using (
    residente_id = auth.uid()
    or exists (select 1 from usuarios u where u.id = auth.uid() and u.rol in ('superintendente','nominas'))
  );

create policy "nominas_insert" on nominas_obra for insert
  with check (residente_id = auth.uid());

create policy "nominas_update_residente" on nominas_obra for update
  using (residente_id = auth.uid() and estado = 'borrador');

create policy "nominas_update_super" on nominas_obra for update
  using (exists (select 1 from usuarios u where u.id = auth.uid() and u.rol in ('superintendente','nominas')));

-- Asistencias: residente edita las de sus nóminas en borrador; super/nominas ven todas
create policy "asistencias_read" on asistencias for select
  using (
    exists (
      select 1 from nominas_obra no
      where no.id = asistencias.nomina_obra_id
      and (no.residente_id = auth.uid()
        or exists (select 1 from usuarios u where u.id = auth.uid() and u.rol in ('superintendente','nominas')))
    )
  );

create policy "asistencias_write" on asistencias for insert
  with check (
    exists (
      select 1 from nominas_obra no
      where no.id = asistencias.nomina_obra_id
      and no.residente_id = auth.uid()
      and no.estado = 'borrador'
    )
  );

create policy "asistencias_update" on asistencias for update
  using (
    exists (
      select 1 from nominas_obra no
      where no.id = asistencias.nomina_obra_id
      and no.residente_id = auth.uid()
      and no.estado = 'borrador'
    )
  );

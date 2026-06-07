import { useAuth } from '../lib/useAuth'
import ResidenteView from '../components/ResidenteView'
import SuperView from '../components/SuperView'
import NominasView from '../components/NominasView'

export default function Home() {
  const { perfil, loading, logout } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (!perfil) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Topbar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏗️</span>
          <span className="font-semibold text-gray-900">Nómina de Obras</span>
          <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full capitalize">
            {perfil.rol}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{perfil.nombre}</span>
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Salir
          </button>
        </div>
      </div>

      {/* Vista según rol */}
      <div className="max-w-full mx-auto px-4 py-6">
        {perfil.rol === 'residente' && <ResidenteView perfil={perfil} />}
        {perfil.rol === 'superintendente' && <SuperView perfil={perfil} />}
        {perfil.rol === 'nominas' && <NominasView perfil={perfil} />}
      </div>
    </div>
  )
}

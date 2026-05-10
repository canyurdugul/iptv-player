export default function LoadingScreen({ message, detail }) {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-6">
      {/* Spinner */}
      <div className="w-20 h-20 rounded-full border-4 border-gray-700 border-t-blue-500 animate-spin" />

      {/* Messages */}
      <div className="text-center">
        <p className="text-white text-lg font-semibold transition-all">
          {message ?? 'Yükleniyor...'}
        </p>
        {detail && (
          <p className="text-gray-400 text-sm mt-1">{detail}</p>
        )}
      </div>
    </div>
  )
}

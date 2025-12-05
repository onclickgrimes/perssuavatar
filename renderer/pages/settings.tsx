import React from 'react';
import Link from 'next/link';

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Configurações Avançadas</h1>
        </div>

        <div className="space-y-6">
          <section className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Geral</h2>
            <p className="text-gray-400">Opções avançadas virão aqui.</p>
          </section>

          <section className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Áudio</h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium mb-1">Dispositivo de Entrada</label>
                    <select className="w-full bg-gray-900 border border-gray-600 rounded p-2">
                        <option>Padrão</option>
                    </select>
                </div>
            </div>
          </section>
          
          <section className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Sobre</h2>
            <p className="text-gray-400">Avatar AI v1.0.0</p>
          </section>
        </div>
      </div>
    </div>
  );
}

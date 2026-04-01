import React, { useState } from 'react';
import Settings from '../components/Settings';

const MODELS = [
  'Yuki', 'Haru', 'Hiyori', 'Mao', 'Mark', 'Natori', 'Rice', 'Wanko', 'Yuino', 'DevilYuki'
];

export default function SettingsPage() {
  const [selectedModel, setSelectedModel] = useState('Yuki');

  return (
    <div className="w-screen h-screen bg-black p-4">
      <Settings
        onSizeChange={() => {}}
        onDragToggle={() => {}}
        models={MODELS}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        isOpen={true}
        onClose={() => {}}
      />
    </div>
  );
}


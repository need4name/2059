import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ITEM_POOLS, getRarityColor, instancedItem } from '@/lib/combat/loot';
import { useInventory } from '@/lib/stores/useInventory';
import { useCombat } from '@/lib/stores/useCombat';
import type { Item, ItemRarity } from '@/lib/combat/types';
import { useState } from 'react';

interface DebugPanelProps {
  onClose?: () => void;
}

export function DebugPanel({ onClose }: DebugPanelProps) {
  const { addItems, addGold } = useInventory();
  const { startFarmCombat } = useCombat();
  const [selectedLevel, setSelectedLevel] = useState(1);
  
  const rarities: ItemRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  
  const handleAddItem = (item: Item) => {
    addItems([instancedItem(item)]);
  };
  
  const handleAddGold = (amount: number) => {
    addGold(amount);
  };
  
  const handleAddAllItems = () => {
    const allItems: Item[] = [];
    rarities.forEach(rarity => {
      ITEM_POOLS[rarity].forEach(item => {
        allItems.push(instancedItem(item));
      });
    });
    addItems(allItems);
  };
  
  const handleSkipToLevel = (level: number) => {
    startFarmCombat(level);
    if (onClose) onClose();
  };
  
  return (
    <Card className="bg-gray-950/98 border-red-800/60 text-white max-w-md w-full mx-auto">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-red-400 font-mono">[DEBUG] Test Mode</CardTitle>
          {onClose && (
            <Button 
              onClick={onClose}
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white"
            >
              ✕
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Level Skip Section */}
        <div className="space-y-2 p-3 bg-slate-900/60 rounded border border-slate-700/50">
          <h4 className="text-sm font-semibold text-amber-400 font-mono">SKIP TO LEVEL</h4>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="1"
              max="50"
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(parseInt(e.target.value))}
              className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <span className="text-amber-300 font-mono w-8 text-right">{selectedLevel}</span>
          </div>
          <Button 
            onClick={() => handleSkipToLevel(selectedLevel)}
            className="w-full bg-amber-600 hover:bg-amber-700 text-black font-mono"
            size="sm"
          >
            START LEVEL {selectedLevel}
          </Button>
        </div>
        
        {/* Quick Level Buttons */}
        <div className="flex flex-wrap gap-1">
          {[1, 5, 10, 15, 20, 25, 30, 40, 50].map(lvl => (
            <Button
              key={lvl}
              onClick={() => handleSkipToLevel(lvl)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-2 py-1"
              size="sm"
            >
              Lv{lvl}
            </Button>
          ))}
        </div>
        
        {/* Give All Items */}
        <div className="space-y-2 p-3 bg-slate-900/60 rounded border border-slate-700/50">
          <h4 className="text-sm font-semibold text-cyan-400 font-mono">INVENTORY</h4>
          <Button 
            onClick={handleAddAllItems}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-black font-mono"
            size="sm"
          >
            ADD ALL ITEMS (55+)
          </Button>
          
          {/* Gold Controls */}
          <div className="flex gap-2 flex-wrap pt-2">
            <Button 
              onClick={() => handleAddGold(100)} 
              className="bg-yellow-600 hover:bg-yellow-700 text-black"
              size="sm"
            >
              +100 Credits
            </Button>
            <Button 
              onClick={() => handleAddGold(1000)} 
              className="bg-yellow-600 hover:bg-yellow-700 text-black"
              size="sm"
            >
              +1000 Credits
            </Button>
          </div>
        </div>
        
        {/* Items by Rarity (collapsed by default) */}
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-slate-400 hover:text-slate-200 font-mono">
            ▶ BROWSE INDIVIDUAL ITEMS
          </summary>
          <div className="mt-3 space-y-3">
            {rarities.map((rarity) => {
              const items = ITEM_POOLS[rarity];
              const color = getRarityColor(rarity);
              
              return (
                <div key={rarity} className="space-y-2">
                  <h4 className="text-xs font-semibold" style={{ color }}>
                    {rarity.toUpperCase()} ({items.length})
                  </h4>
                  <div className="grid grid-cols-2 gap-1">
                    {items.map((item) => (
                      <Button
                        key={item.id}
                        onClick={() => handleAddItem(item)}
                        className="text-xs p-1.5 h-auto flex flex-col items-start bg-gray-800 hover:bg-gray-700 border border-gray-600"
                        variant="outline"
                      >
                        <div className="flex items-center gap-1 w-full">
                          <span className="text-sm">{item.icon || '⚙️'}</span>
                          <span className="flex-1 truncate text-left text-[10px]" style={{ color }}>
                            {item.name}
                          </span>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

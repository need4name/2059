import { useEffect } from 'react';
import { LootDrop } from '@/lib/combat/types';
import { getRarityColor } from '@/lib/combat/loot';
import { useInventory } from '@/lib/stores/useInventory';
import { Badge } from '@/components/ui/badge';
import { Coins } from 'lucide-react';

interface LootDisplayProps {
  loot: LootDrop;
}

export function LootDisplay({ loot }: LootDisplayProps) {
  const { addItems, addGold } = useInventory();
  
  useEffect(() => {
    // Add loot to inventory
    addItems(loot.items);
    addGold(loot.gold);
  }, [loot, addItems, addGold]);
  
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-center text-yellow-400">Loot Acquired!</h3>
      
      <div className="flex items-center justify-center gap-2 bg-gray-800 p-3 rounded-lg">
        <Coins className="w-5 h-5 text-yellow-400" />
        <span className="text-lg font-bold text-yellow-400">{loot.gold} Gold</span>
      </div>
      
      <div className="space-y-2">
        {loot.items.map((item, index) => (
          <div 
            key={`${item.id}-${index}`} 
            className="flex items-center gap-3 bg-gray-800 p-3 rounded-lg"
          >
            <div className="w-10 h-10 bg-stone-700 border-2 border-stone-500 rounded flex items-center justify-center text-amber-300 text-sm font-bold">
              {item.type === 'weapon' ? 'WPN' : item.type === 'armor' ? 'ARM' : 'USE'}
            </div>
            <div className="flex-1">
              <div className="font-bold" style={{ color: getRarityColor(item.rarity) }}>
                {item.name}
              </div>
              <div className="text-xs text-gray-400">
                {item.type} • 
                {item.attackBonus && ` +${item.attackBonus} ATK`}
                {item.defenseBonus && ` +${item.defenseBonus} DEF`}
                {item.hpBonus && ` +${item.hpBonus} HP`}
              </div>
            </div>
            <Badge 
              className="text-xs" 
              style={{ 
                backgroundColor: getRarityColor(item.rarity),
                color: '#000',
              }}
            >
              {item.rarity}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Reaction, ReactionEmoji } from '@/types/journey';
import { REACTION_EMOJIS } from '@/types/journey';

interface ReactionBarProps {
  reactions: Reaction[];
  onReact: (emoji: ReactionEmoji) => void;
  size?: 'small' | 'medium';
}

export function ReactionBar({ reactions, onReact, size = 'medium' }: ReactionBarProps) {
  const reactionMap = new Map(reactions.map((r) => [r.emoji, r]));

  const isSmall = size === 'small';

  return (
    <View style={[styles.container, isSmall && styles.containerSmall]}>
      {REACTION_EMOJIS.map((emoji) => {
        const reaction = reactionMap.get(emoji);
        const count = reaction?.count ?? 0;

        return (
          <TouchableOpacity
            key={emoji}
            style={[styles.reactionButton, isSmall && styles.reactionButtonSmall]}
            onPress={() => onReact(emoji)}
            data-testid={`reaction-${emoji}`}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={[styles.emoji, isSmall && styles.emojiSmall]}>{emoji}</Text>
            {count > 0 && (
              <Text style={[styles.count, isSmall && styles.countSmall]}>{count}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  containerSmall: {
    gap: 2,
  },
  reactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reactionButtonSmall: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 2,
  },
  emoji: {
    fontSize: 16,
  },
  emojiSmall: {
    fontSize: 13,
  },
  count: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  countSmall: {
    fontSize: 11,
  },
});

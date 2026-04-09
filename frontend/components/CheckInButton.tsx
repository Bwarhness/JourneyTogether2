import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

interface CheckInButtonProps {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  label?: string; // Optional override text
}

export function CheckInButton({
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  label,
}: CheckInButtonProps) {
  const isDisabled = disabled || loading;

  const backgroundColor = variant === 'danger'
    ? '#E07A5F'
    : variant === 'secondary'
    ? '#f0f0f0'
    : Colors.light.tint;

  const textColor = variant === 'secondary' ? '#333' : '#fff';

  const iconName = variant === 'danger' ? 'close' : variant === 'secondary' ? 'time-outline' : 'checkmark';

  const buttonLabel = label
    ?? (variant === 'danger' ? 'End Journey Early' : variant === 'secondary' ? 'Check In Later' : 'Check In Here');

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor },
        isDisabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          <Ionicons name={iconName as any} size={20} color={textColor} />
          <Text style={[styles.buttonText, { color: textColor }]}>
            {buttonLabel}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  disabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});

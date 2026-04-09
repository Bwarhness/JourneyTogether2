import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useJourneyStore } from '@/stores/journeyStore';
import { JourneyCard } from '@/components/JourneyCard';
import type { Journey } from '@/types/journey';
import { Colors } from '@/constants/theme';

const DEBOUNCE_MS = 400;

export default function ExploreScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { exploredJourneys, searchLoading, error, searchJourneys, fetchPublicJourneys } =
    useJourneyStore();

  // Load public journeys on mount
  useEffect(() => {
    fetchPublicJourneys();
  }, []);

  const handleQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        if (text.trim()) {
          searchJourneys(text.trim());
        } else {
          fetchPublicJourneys();
        }
      }, DEBOUNCE_MS);
    },
    [searchJourneys, fetchPublicJourneys]
  );

  const handleClearSearch = () => {
    setQuery('');
    fetchPublicJourneys();
    Keyboard.dismiss();
  };

  const handleJourneyPress = (journeyId: string) => {
    router.push(`/journey/${journeyId}`);
  };

  const renderJourneyItem = ({ item }: { item: Journey }) => (
    <JourneyCard journey={item} onPress={handleJourneyPress} />
  );

  const renderHeader = () => (
    <View style={styles.header}>
      {/* Title */}
      <Text style={styles.title}>Discover</Text>
      <Text style={styles.subtitle}>Find journeys created by the community</Text>

      {/* Search Bar */}
      <View style={[styles.searchBar, isSearchFocused && styles.searchBarFocused]}>
        <Ionicons name="search" size={18} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search journeys, tags, places..."
          placeholderTextColor="#aaa"
          value={query}
          onChangeText={handleQueryChange}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          data-testid="explore-search-input"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={handleClearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Section label */}
      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>
          {query.trim()
            ? `Results for "${query.trim()}"`
            : 'Popular Journeys'}
        </Text>
        <Text style={styles.resultCount}>
          {searchLoading ? '...' : `${exploredJourneys.length} found`}
        </Text>
      </View>
    </View>
  );

  const renderEmptyState = () => {
    if (searchLoading) return null;
    if (query.trim()) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={56} color="#ccc" />
          <Text style={styles.emptyTitle}>No journeys found</Text>
          <Text style={styles.emptyText}>
            No journeys match "{query.trim()}".{'\n'}Try different keywords or browse popular journeys.
          </Text>
          <TouchableOpacity style={styles.browseButton} onPress={handleClearSearch}>
            <Text style={styles.browseButtonText}>Browse Popular Journeys</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Ionicons name="compass-outline" size={56} color="#ccc" />
        <Text style={styles.emptyTitle}>No journeys yet</Text>
        <Text style={styles.emptyText}>
          Be the first to share a journey!{'\n'}Create one from the Home tab.
        </Text>
      </View>
    );
  };

  const renderErrorState = () => (
    <View style={styles.errorState}>
      <Ionicons name="warning-outline" size={48} color="#E07A5F" />
      <Text style={styles.errorText}>{error || 'Something went wrong'}</Text>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={() => (query.trim() ? searchJourneys(query.trim()) : fetchPublicJourneys())}
      >
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={exploredJourneys}
        keyExtractor={(item) => item.id}
        renderItem={renderJourneyItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          error ? renderErrorState() : !searchLoading ? renderEmptyState() : null
        }
        ListFooterComponent={
          searchLoading ? (
            <View style={styles.loadingFooter}>
              <ActivityIndicator size="small" color={Colors.light.tint} />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: -4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    height: 44,
    gap: 8,
  },
  searchBarFocused: {
    borderColor: Colors.light.tint,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111',
    padding: 0,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  resultCount: {
    fontSize: 13,
    color: '#999',
  },
  loadingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  loadingText: {
    fontSize: 13,
    color: '#999',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  browseButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
  },
  browseButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});

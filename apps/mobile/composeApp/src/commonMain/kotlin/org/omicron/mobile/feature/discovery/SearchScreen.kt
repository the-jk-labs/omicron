package org.omicron.mobile.feature.discovery

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButton
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.input.Input
import org.omicron.mobile.core.designsystem.rikkaui.spinner.Spinner
import org.omicron.mobile.core.designsystem.rikkaui.spinner.SpinnerSize
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.domain.model.DiscoveryPerson
import org.omicron.mobile.domain.model.DiscoveryTag
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.discover_articles_many
import org.omicron.mobile.resources.discover_articles_one
import org.omicron.mobile.resources.search_action
import org.omicron.mobile.resources.search_author_filter
import org.omicron.mobile.resources.search_author_placeholder
import org.omicron.mobile.resources.search_back
import org.omicron.mobile.resources.search_browse_discover
import org.omicron.mobile.resources.search_clear_filters
import org.omicron.mobile.resources.search_empty_prompt_description
import org.omicron.mobile.resources.search_empty_prompt_title
import org.omicron.mobile.resources.search_error_offline
import org.omicron.mobile.resources.search_error_server
import org.omicron.mobile.resources.search_hint
import org.omicron.mobile.resources.search_loading
import org.omicron.mobile.resources.search_no_results_description
import org.omicron.mobile.resources.search_no_results_title
import org.omicron.mobile.resources.search_retry
import org.omicron.mobile.resources.search_tab_articles
import org.omicron.mobile.resources.search_tab_people
import org.omicron.mobile.resources.search_tab_tags
import org.omicron.mobile.resources.search_tag_filter
import org.omicron.mobile.resources.search_tag_placeholder
import org.omicron.mobile.resources.search_title
import org.omicron.mobile.resources.timeline_error_missing_instance
import zed.rainxch.rikkaui.foundation.RikkaTheme

@Composable
fun SearchRoute(
    viewModel: SearchViewModel,
    onBack: () -> Unit,
    onOpenDiscover: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenTag: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    SearchScreen(
        state = state,
        onBack = onBack,
        onOpenDiscover = onOpenDiscover,
        onQueryChange = viewModel::updateQuery,
        onTagFilterChange = viewModel::updateTagFilter,
        onAuthorFilterChange = viewModel::updateAuthorFilter,
        onSearch = viewModel::search,
        onRetry = viewModel::retry,
        onSelectTab = viewModel::selectTab,
        onClearFilters = viewModel::clearFilters,
        onOpenPost = onOpenPost,
        onOpenProfile = onOpenProfile,
        onOpenTag = onOpenTag,
    )
}

@Composable
private fun SearchScreen(
    state: SearchUiState,
    onBack: () -> Unit,
    onOpenDiscover: () -> Unit,
    onQueryChange: (String) -> Unit,
    onTagFilterChange: (String) -> Unit,
    onAuthorFilterChange: (String) -> Unit,
    onSearch: () -> Unit,
    onRetry: () -> Unit,
    onSelectTab: (SearchTab) -> Unit,
    onClearFilters: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenTag: (String) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().background(OmicronTheme.colors.background).safeDrawingPadding(),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                icon = RikkaIcons.ArrowLeft,
                contentDescription = stringResource(Res.string.search_back),
                onClick = onBack,
                size = IconButtonSize.Default,
            )
            Text(
                text = stringResource(Res.string.search_title),
                variant = TextVariant.H2,
                color = OmicronTheme.colors.foreground,
                modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
            )
        }
        Column(
            modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Input(
                value = state.query,
                onValueChange = onQueryChange,
                placeholder = stringResource(Res.string.search_hint),
                label = stringResource(Res.string.search_hint),
                leadingIcon = RikkaIcons.Search,
                clearable = true,
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            )
            Input(
                value = state.tagFilter,
                onValueChange = onTagFilterChange,
                placeholder = stringResource(Res.string.search_tag_placeholder),
                label = stringResource(Res.string.search_tag_filter),
                clearable = true,
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            )
            Input(
                value = state.authorFilter,
                onValueChange = onAuthorFilterChange,
                placeholder = stringResource(Res.string.search_author_placeholder),
                label = stringResource(Res.string.search_author_filter),
                clearable = true,
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            )
            Button(
                text = stringResource(Res.string.search_action),
                onClick = onSearch,
                size = ButtonSize.Lg,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                enabled = state.query.isNotBlank(),
            )
        }
        Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            when (val phase = state.phase) {
                is SearchPhase.Idle -> SearchPrompt(onOpenDiscover = onOpenDiscover)
                is SearchPhase.Loading -> SearchLoading()
                is SearchPhase.Empty -> SearchEmpty()
                is SearchPhase.Error -> SearchError(error = phase.error, onRetry = onRetry)
                is SearchPhase.Content ->
                    SearchResults(
                        state = state,
                        onSelectTab = onSelectTab,
                        onClearFilters = onClearFilters,
                        onOpenPost = onOpenPost,
                        onOpenProfile = onOpenProfile,
                        onOpenTag = onOpenTag,
                    )
            }
        }
    }
}

@Composable
private fun SearchPrompt(onOpenDiscover: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = stringResource(Res.string.search_empty_prompt_title), variant = TextVariant.H3)
        Text(text = stringResource(Res.string.search_empty_prompt_description), variant = TextVariant.Muted)
        Button(
            text = stringResource(Res.string.search_browse_discover),
            onClick = onOpenDiscover,
            variant = ButtonVariant.Outline,
            size = ButtonSize.Lg,
        )
    }
}

@Composable
private fun SearchLoading() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Spinner(size = SpinnerSize.Lg, label = stringResource(Res.string.search_loading))
    }
}

@Composable
private fun SearchEmpty() {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = stringResource(Res.string.search_no_results_title), variant = TextVariant.H3)
        Text(text = stringResource(Res.string.search_no_results_description), variant = TextVariant.Muted)
    }
}

@Composable
private fun SearchError(error: SearchError, onRetry: () -> Unit) {
    val message =
        when (error) {
            SearchError.Offline -> stringResource(Res.string.search_error_offline)
            SearchError.Server -> stringResource(Res.string.search_error_server)
            SearchError.MissingInstance -> stringResource(Res.string.timeline_error_missing_instance)
        }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = message, variant = TextVariant.P)
        Button(text = stringResource(Res.string.search_retry), onClick = onRetry, size = ButtonSize.Lg)
    }
}

@Composable
private fun SearchResults(
    state: SearchUiState,
    onSelectTab: (SearchTab) -> Unit,
    onClearFilters: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenTag: (String) -> Unit,
) {
    val results = state.results
    Column(modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SearchTabButton(
                label = "${stringResource(Res.string.search_tab_articles)} (${results.posts.size})",
                selected = state.selectedTab == SearchTab.Articles,
                onClick = { onSelectTab(SearchTab.Articles) },
            )
            SearchTabButton(
                label = "${stringResource(Res.string.search_tab_tags)} (${results.tags.size})",
                selected = state.selectedTab == SearchTab.Tags,
                onClick = { onSelectTab(SearchTab.Tags) },
            )
            SearchTabButton(
                label = "${stringResource(Res.string.search_tab_people)} (${results.people.size})",
                selected = state.selectedTab == SearchTab.People,
                onClick = { onSelectTab(SearchTab.People) },
            )
        }
        if (state.tagFilter.isNotBlank() || state.authorFilter.isNotBlank()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                Button(
                    text = stringResource(Res.string.search_clear_filters),
                    onClick = onClearFilters,
                    variant = ButtonVariant.Ghost,
                    size = ButtonSize.Sm,
                )
            }
        }
        LazyColumn(modifier = Modifier.fillMaxWidth()) {
            when (state.selectedTab) {
                SearchTab.Articles ->
                    items(
                        items = results.posts,
                        key = { post -> post.id },
                        contentType = { DISCOVERY_POST_TYPE },
                    ) { post ->
                        DiscoveryPostRow(post = post, onOpen = { onOpenPost(post.id) })
                    }
                SearchTab.Tags ->
                    items(
                        items = results.tags,
                        key = { tag -> tag.slug },
                        contentType = { DISCOVERY_TAG_TYPE },
                    ) { tag ->
                        SearchTagRow(tag = tag, onOpen = { onOpenTag(tag.slug) })
                    }
                SearchTab.People ->
                    items(
                        items = results.people,
                        key = { person -> person.id },
                        contentType = { DISCOVERY_PERSON_TYPE },
                    ) { person ->
                        SearchPersonRow(person = person, onOpen = { onOpenProfile(person.username) })
                    }
            }
        }
    }
}

@Composable
private fun SearchTabButton(label: String, selected: Boolean, onClick: () -> Unit) {
    Button(
        text = label,
        onClick = onClick,
        variant = if (selected) ButtonVariant.Default else ButtonVariant.Ghost,
        size = ButtonSize.Sm,
    )
}

@Composable
private fun SearchTagRow(tag: DiscoveryTag, onOpen: () -> Unit) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RikkaTheme.shapes.lg)
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "#${tag.name}",
            variant = TextVariant.P,
            color = OmicronTheme.colors.foreground,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text =
                if (tag.postCount == 1) {
                    stringResource(Res.string.discover_articles_one)
                } else {
                    stringResource(Res.string.discover_articles_many, tag.postCount)
                },
            variant = TextVariant.Small,
            color = OmicronTheme.colors.mutedForeground,
        )
    }
}

@Composable
private fun SearchPersonRow(person: DiscoveryPerson, onOpen: () -> Unit) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DiscoveryAvatar(displayName = person.displayName, avatarUrl = person.avatarUrl)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = person.displayName,
                variant = TextVariant.P,
                color = OmicronTheme.colors.foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "@${person.username}",
                variant = TextVariant.Small,
                color = OmicronTheme.colors.mutedForeground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

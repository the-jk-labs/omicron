package org.omicron.mobile.feature.lists

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.omicron.mobile.feature.navigation.FakeMobileWebApi
import org.omicron.mobile.feature.navigation.fakeMobileWebRepository
import org.omicron.mobile.feature.navigation.fakePostDto
import kotlin.test.Test
import kotlin.test.assertEquals

class ListDetailViewModelTest {
    @Test
    fun loadsListPostsAndPassesOpaqueCursorOnNextPage() = runTest {
        val api = FakeMobileWebApi().apply {
            listPosts = listOf(fakePostDto("post-1"))
            nextListCursor = "opaque-next"
        }
        val viewModel = listViewModel(api)
        testScheduler.advanceUntilIdle()

        assertEquals(ListDetailPhase.Content, viewModel.uiState.value.phase)
        assertEquals("list-1", viewModel.uiState.value.detail?.list?.id)
        assertEquals("opaque-next", viewModel.uiState.value.nextCursor)

        api.nextListCursor = null
        viewModel.loadMore()
        testScheduler.advanceUntilIdle()
        assertEquals(listOf(null, "opaque-next"), api.listCursors)
        assertEquals(2, viewModel.uiState.value.posts.size)
        viewModel.close()
    }

    @Test
    fun mapsListLoadFailureToErrorState() = runTest {
        val api = FakeMobileWebApi().apply { failListItems = true }
        val viewModel = listViewModel(api)
        testScheduler.advanceUntilIdle()

        assertEquals(ListDetailPhase.Error, viewModel.uiState.value.phase)
        viewModel.close()
    }

    private fun TestScope.listViewModel(api: FakeMobileWebApi) =
        ListDetailViewModel(
            listId = "list-1",
            repository = fakeMobileWebRepository(api),
            scope = TestScope(StandardTestDispatcher(testScheduler)),
        )
}

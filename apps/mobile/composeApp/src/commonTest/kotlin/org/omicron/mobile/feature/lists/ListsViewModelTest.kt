package org.omicron.mobile.feature.lists

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.omicron.mobile.feature.navigation.FakeMobileWebApi
import org.omicron.mobile.feature.navigation.fakeMobileWebRepository
import org.omicron.mobile.feature.navigation.readingList
import kotlin.test.Test
import kotlin.test.assertEquals

class ListsViewModelTest {
    @Test
    fun loadsListsAndPinsCreatedListAfterReadLater() = runTest {
        val api = FakeMobileWebApi().apply {
            lists = listOf(readingList("normal", "Travel"), readingList("read-later", "Read later", isReadLater = true))
        }
        val viewModel = listsViewModel(api)
        testScheduler.advanceUntilIdle()

        viewModel.createList("New", "Notes", "private")
        testScheduler.advanceUntilIdle()

        assertEquals(ListsPhase.Content, viewModel.uiState.value.phase)
        assertEquals(listOf("read-later", "created", "normal"), viewModel.uiState.value.lists.map { it.id })
        assertEquals(false, viewModel.uiState.value.isCreating)
        viewModel.close()
    }

    @Test
    fun reportsLoadAndCreateFailuresWithoutDroppingExistingLists() = runTest {
        val api = FakeMobileWebApi()
        val viewModel = listsViewModel(api)
        testScheduler.advanceUntilIdle()
        api.failCreateList = true

        viewModel.createList("New", "", "public")
        testScheduler.advanceUntilIdle()

        assertEquals(1, viewModel.uiState.value.lists.size)
        assertEquals(false, viewModel.uiState.value.isCreating)
        check(viewModel.uiState.value.createError != null)

        api.failLists = true
        viewModel.retry()
        testScheduler.advanceUntilIdle()
        assertEquals(ListsPhase.Error, viewModel.uiState.value.phase)
        viewModel.close()
    }

    private fun TestScope.listsViewModel(api: FakeMobileWebApi) =
        ListsViewModel(
            repository = fakeMobileWebRepository(api),
            scope = TestScope(StandardTestDispatcher(testScheduler)),
        )
}

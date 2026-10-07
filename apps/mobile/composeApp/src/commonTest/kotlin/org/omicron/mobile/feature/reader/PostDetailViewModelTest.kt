package org.omicron.mobile.feature.reader

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.io.IOException
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.PostsApi
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.data.repository.MissingInstanceException
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.domain.model.InstanceConfiguration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class PostDetailViewModelTest {
    @Test
    fun loadsPostAndRelatedTogether() = runTest {
        val viewModel = detailViewModel()
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertIs<PostDetailPhase.Content>(state.phase)
        assertEquals("post-1", state.post?.id)
        assertEquals("<p>Hello</p>", state.post?.contentHtml)
        assertEquals(listOf("post-2"), state.related.map { it.id })
    }

    @Test
    fun mapsHttp404ToNotFound() = runTest {
        val viewModel = detailViewModel(failure = notFound())
        testScheduler.advanceUntilIdle()

        assertIs<PostDetailPhase.NotFound>(viewModel.uiState.value.phase)
    }

    @Test
    fun mapsNetworkFailuresToOffline() = runTest {
        val viewModel = detailViewModel(failure = IOException("unresolved"))
        testScheduler.advanceUntilIdle()

        assertEquals(PostDetailPhase.Error(PostDetailError.Offline), viewModel.uiState.value.phase)
    }

    @Test
    fun mapsMissingInstance() = runTest {
        val repository = PostsRepository(FailingDetailApi(MissingInstanceException()), savedInstance = { null })
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel = PostDetailViewModel(repository, "post-1", TestScope(dispatcher))
        testScheduler.advanceUntilIdle()

        assertEquals(PostDetailPhase.Error(PostDetailError.MissingInstance), viewModel.uiState.value.phase)
    }

    @Test
    fun relatedFailureStillShowsPost() = runTest {
        val api = DetailApi(failRelated = true)
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            PostDetailViewModel(
                PostsRepository(api, savedInstance = { instance() }),
                "post-1",
                TestScope(dispatcher),
            )
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertIs<PostDetailPhase.Content>(state.phase)
        assertEquals(emptyList(), state.related)
    }

    @Test
    fun retryRecoversFromError() = runTest {
        val api = DetailApi(failFirst = true)
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            PostDetailViewModel(
                PostsRepository(api, savedInstance = { instance() }),
                "post-1",
                TestScope(dispatcher),
            )
        testScheduler.advanceUntilIdle()
        assertIs<PostDetailPhase.Error>(viewModel.uiState.value.phase)

        viewModel.retry()
        testScheduler.advanceUntilIdle()

        assertIs<PostDetailPhase.Content>(viewModel.uiState.value.phase)
    }
}

private fun TestScope.detailViewModel(failure: Throwable? = null): PostDetailViewModel {
    val api = if (failure == null) DetailApi() else FailingDetailApi(failure)
    val dispatcher = StandardTestDispatcher(testScheduler)
    return PostDetailViewModel(PostsRepository(api, savedInstance = { instance() }), "post-1", TestScope(dispatcher))
}

private suspend fun notFound(): ClientRequestException {
    val client =
        HttpClient(
            MockEngine {
                respond(content = """{"error":"not found"}""", status = HttpStatusCode.NotFound)
            },
        ) {
            expectSuccess = true
        }
    return try {
        client.get("https://omicron.blog/api/posts/missing")
        error("expected 404")
    } catch (exception: ClientRequestException) {
        exception
    }
}

private fun detailDto(id: String) =
    PostDto(
        id = id,
        title = "Title $id",
        contentHtml = "<p>Hello</p>",
        createdAt = "2026-01-01T00:00:00Z",
        author = PostAuthorDto("user-1", "alice", "Alice"),
    )

private fun instance() =
    InstanceConfiguration(
        origin = "https://omicron.blog",
        name = "Omicron",
        domain = "omicron.blog",
        federationEnabled = true,
        setupComplete = true,
        emailEnabled = true,
        emailVerificationRequired = true,
    )

private class DetailApi(
    private val failFirst: Boolean = false,
    private val failRelated: Boolean = false,
) : PostsApi {
    private var calls = 0

    override suspend fun timeline(
        origin: String,
        scope: TimelineScope,
        cursor: String?,
    ): TimelinePageDto = TimelinePageDto()

    override suspend fun post(
        origin: String,
        id: String,
    ): PostDto {
        calls += 1
        if (failFirst && calls == 1) throw IOException("unresolved")
        return detailDto(id)
    }

    override suspend fun relatedPosts(
        origin: String,
        id: String,
    ): List<PostDto> {
        if (failRelated) throw IOException("unresolved")
        return listOf(detailDto("post-2"))
    }
}

private class FailingDetailApi(
    private val failure: Throwable,
) : PostsApi {
    override suspend fun timeline(
        origin: String,
        scope: TimelineScope,
        cursor: String?,
    ): TimelinePageDto = throw failure

    override suspend fun post(
        origin: String,
        id: String,
    ): PostDto = throw failure

    override suspend fun relatedPosts(
        origin: String,
        id: String,
    ): List<PostDto> = throw failure
}

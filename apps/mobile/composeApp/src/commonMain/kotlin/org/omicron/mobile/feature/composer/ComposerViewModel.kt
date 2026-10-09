package org.omicron.mobile.feature.composer

import io.ktor.client.plugins.ClientRequestException
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.io.IOException
import org.omicron.mobile.data.repository.AuthoringRepository
import org.omicron.mobile.data.repository.MissingInstanceException
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.data.repository.UnauthorizedException
import org.omicron.mobile.domain.model.ComposerBlock
import org.omicron.mobile.domain.model.CreatePostInput
import org.omicron.mobile.domain.model.OwnPostStatus
import org.omicron.mobile.domain.model.UpdatePostInput
import org.omicron.mobile.domain.model.hasContent
import org.omicron.mobile.domain.model.parseComposerHtml
import org.omicron.mobile.domain.model.toHtml

class ComposerViewModel(
    private val authoringRepository: AuthoringRepository,
    private val postsRepository: PostsRepository,
    private val postId: String? = null,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val mutableUiState = MutableStateFlow(ComposerUiState(postId = postId))
    val uiState: StateFlow<ComposerUiState> = mutableUiState.asStateFlow()

    private var nextBlockNumber = 0
    private var autosaveJob: Job? = null
    private var saving = false
    private var uploading = false
    private var lastUpload: Pair<ByteArray, String>? = null

    init {
        if (postId == null) {
            mutableUiState.update { it.copy(loadPhase = ComposerLoadPhase.Content) }
        } else {
            scope.launch {
                mutableUiState.update { it.copy(loadPhase = ComposerLoadPhase.Loading) }
                runCatching { postsRepository.postDetail(postId) }
                    .onSuccess { detail ->
                        val blocks = parseComposerHtml(detail.contentHtml).ifEmpty { listOf(ComposerBlock.Paragraph(id = nextFreshId())) }
                        mutableUiState.update {
                            it.copy(
                                title = detail.title.orEmpty(),
                                blocks = blocks,
                                summary = detail.summary.orEmpty(),
                                tags = detail.tags.joinToString(" ") { tag -> tag.slug },
                                language = detail.language.orEmpty(),
                                sourceStatus = detail.status,
                                loadPhase = ComposerLoadPhase.Content,
                            )
                        }
                    }.onFailure { error ->
                        mutableUiState.update { it.copy(loadPhase = ComposerLoadPhase.Error(error.toComposerError())) }
                    }
            }
        }
    }

    fun updateTitle(value: String) {
        mutableUiState.update { it.copy(title = value, dirty = true) }
        scheduleAutosave()
    }

    fun updateSummary(value: String) {
        mutableUiState.update { it.copy(summary = value, dirty = true) }
        scheduleAutosave()
    }

    fun updateTags(value: String) {
        mutableUiState.update { it.copy(tags = value, dirty = true) }
        scheduleAutosave()
    }

    fun updateLanguage(value: String) {
        mutableUiState.update { it.copy(language = value, dirty = true) }
        scheduleAutosave()
    }

    fun updateBlockText(id: String, text: String) {
        mutableUiState.update { state ->
            state.copy(blocks = state.blocks.map { it.withText(id, text) }, dirty = true)
        }
        scheduleAutosave()
    }

    fun updateListItem(id: String, index: Int, text: String) {
        mutableUiState.update { state ->
            state.copy(blocks = state.blocks.map { it.withListItem(id, index, text) }, dirty = true)
        }
        scheduleAutosave()
    }

    fun addListItem(id: String) {
        mutableUiState.update { state ->
            state.copy(blocks = state.blocks.map { it.appendingListItem(id) }, dirty = true)
        }
        scheduleAutosave()
    }

    fun removeListItem(id: String, index: Int) {
        mutableUiState.update { state ->
            state.copy(blocks = state.blocks.map { it.removingListItem(id, index) }, dirty = true)
        }
        scheduleAutosave()
    }

    fun addBlock(type: ComposerBlockType) {
        val block = type.newBlock(nextFreshId())
        mutableUiState.update { state ->
            state.copy(blocks = state.blocks + block, dirty = true)
        }
        scheduleAutosave()
    }

    fun changeBlockType(id: String, type: ComposerBlockType) {
        mutableUiState.update { state ->
            state.copy(blocks = state.blocks.map { it.converted(id, type) }, dirty = true)
        }
        scheduleAutosave()
    }

    fun removeBlock(id: String) {
        mutableUiState.update { state ->
            state.copy(blocks = state.blocks.filterNot { it.id == id }, dirty = true)
        }
        scheduleAutosave()
    }

    fun updateImageAlt(id: String, alt: String) {
        mutableUiState.update { state ->
            state.copy(
                blocks =
                    state.blocks.map { block ->
                        if (block is ComposerBlock.Image && block.id == id) block.copy(alt = alt.ifEmpty { null }) else block
                    },
                dirty = true,
            )
        }
        scheduleAutosave()
    }

    fun pickImageResult(bytes: ByteArray, mime: String?) {
        val type = mime?.substringBefore(";")?.trim()?.lowercase()
        if (type == null || type !in SUPPORTED_IMAGE_TYPES) {
            mutableUiState.update { it.copy(imageUpload = ImageUploadState.Error(ComposerError.UnsupportedType, retryable = false)) }
            return
        }
        if (bytes.size > MAX_IMAGE_BYTES) {
            mutableUiState.update { it.copy(imageUpload = ImageUploadState.Error(ComposerError.TooLarge, retryable = false)) }
            return
        }
        lastUpload = bytes to type
        uploadPickedImage()
    }

    fun retryImageUpload() {
        uploadPickedImage()
    }

    private fun uploadPickedImage() {
        val pending = lastUpload ?: return
        if (uploading) return
        uploading = true
        mutableUiState.update { it.copy(imageUpload = ImageUploadState.Uploading) }
        scope.launch {
            runCatching { authoringRepository.uploadImage(pending.first, pending.second) }
                .onSuccess { image ->
                    uploading = false
                    lastUpload = null
                    mutableUiState.update { state ->
                        state.copy(
                            blocks = state.blocks + ComposerBlock.Image(id = nextFreshId(), url = image.url),
                            imageUpload = ImageUploadState.Idle,
                            dirty = true,
                        )
                    }
                    scheduleAutosave()
                }.onFailure { error ->
                    uploading = false
                    mutableUiState.update { it.copy(imageUpload = ImageUploadState.Error(error.toComposerError(), retryable = true)) }
                }
        }
    }

    fun saveDraft() {
        persist(requested = true, status = null)
    }

    fun publish() {
        val state = mutableUiState.value
        if (state.title.trim().isEmpty()) {
            mutableUiState.update { it.copy(publish = ComposerPublish.Validation(PublishIssue.MissingTitle)) }
            return
        }
        if (state.blocks.toHtml().isBlank()) {
            mutableUiState.update { it.copy(publish = ComposerPublish.Validation(PublishIssue.EmptyBody)) }
            return
        }
        persist(requested = true, status = OwnPostStatus.Published)
    }

    fun retryLoad() {
        if (postId == null) return
        scope.launch {
            mutableUiState.update { it.copy(loadPhase = ComposerLoadPhase.Loading) }
            runCatching { postsRepository.postDetail(postId) }
                .onSuccess { detail ->
                    val blocks = parseComposerHtml(detail.contentHtml).ifEmpty { listOf(ComposerBlock.Paragraph(id = nextFreshId())) }
                    mutableUiState.update {
                        it.copy(
                            title = detail.title.orEmpty(),
                            blocks = blocks,
                            summary = detail.summary.orEmpty(),
                            tags = detail.tags.joinToString(" ") { tag -> tag.slug },
                            language = detail.language.orEmpty(),
                            sourceStatus = detail.status,
                            loadPhase = ComposerLoadPhase.Content,
                        )
                    }
                }.onFailure { error ->
                    mutableUiState.update { it.copy(loadPhase = ComposerLoadPhase.Error(error.toComposerError())) }
                }
        }
    }

    fun retrySave() {
        mutableUiState.update { it.copy(save = ComposerSave.Idle) }
        persist(requested = true, status = null)
    }

    fun dismissPublishValidation() {
        mutableUiState.update { it.copy(publish = ComposerPublish.Idle) }
    }

    fun close() {
        autosaveJob?.cancel()
        scope.cancel()
    }

    private fun nextFreshId(): String {
        nextBlockNumber += 1
        return "new-$nextBlockNumber"
    }

    private fun scheduleAutosave() {
        autosaveJob?.cancel()
        val state = mutableUiState.value
        if (state.loadPhase != ComposerLoadPhase.Content) return
        if (!state.composableContent()) return
        autosaveJob =
            scope.launch {
                delay(AUTOSAVE_DELAY_MILLIS)
                persist(requested = false, status = null)
            }
    }

    private fun persist(requested: Boolean, status: OwnPostStatus?) {
        if (saving) return
        val state = mutableUiState.value
        if (state.loadPhase != ComposerLoadPhase.Content) return
        if (status == null && !state.composableContent()) {
            if (requested) mutableUiState.update { it.copy(save = ComposerSave.Validation(PublishIssue.EmptyBody)) }
            return
        }
        autosaveJob?.cancel()
        saving = true
        if (status == null) {
            mutableUiState.update { it.copy(save = ComposerSave.Saving) }
        } else {
            mutableUiState.update { it.copy(publish = ComposerPublish.Publishing) }
        }
        scope.launch {
            val snapshot = mutableUiState.value
            val tags = snapshot.tags.toTagList().ifEmpty { null }
            runCatching {
                val currentId = mutableUiState.value.postId
                if (currentId == null) {
                    authoringRepository.createPost(
                        CreatePostInput(
                            title = snapshot.title.trim().ifEmpty { null },
                            contentHtml = snapshot.blocks.toHtml(),
                            status = status ?: OwnPostStatus.Draft,
                            language = snapshot.language.trim().ifEmpty { null },
                            summary = snapshot.summary.trim().ifEmpty { null },
                            tags = tags,
                        ),
                    )
                } else {
                    authoringRepository.updatePost(
                        currentId,
                        UpdatePostInput(
                            title = snapshot.title.trim().ifEmpty { null },
                            contentHtml = snapshot.blocks.toHtml(),
                            status = status,
                            language = snapshot.language.trim().ifEmpty { null },
                            summary = snapshot.summary.trim().ifEmpty { null },
                            tags = tags,
                        ),
                    )
                }
            }.onSuccess { post ->
                saving = false
                if (status == null) {
                    mutableUiState.update { it.copy(postId = post.id, save = ComposerSave.Saved, dirty = false) }
                } else {
                    mutableUiState.update { it.copy(postId = post.id, publish = ComposerPublish.Published, dirty = false) }
                }
            }.onFailure { error ->
                saving = false
                val mapped = error.toComposerError()
                if (status == null) {
                    mutableUiState.update { it.copy(save = ComposerSave.Error(mapped)) }
                } else {
                    mutableUiState.update { it.copy(publish = ComposerPublish.Error(mapped)) }
                }
            }
        }
    }

    private companion object {
        const val AUTOSAVE_DELAY_MILLIS = 2000L
    }
}

data class ComposerUiState(
    val title: String = "",
    val blocks: List<ComposerBlock> = listOf(ComposerBlock.Paragraph(id = "new-0")),
    val summary: String = "",
    val tags: String = "",
    val language: String = "",
    val postId: String? = null,
    val sourceStatus: OwnPostStatus? = null,
    val imageUpload: ImageUploadState = ImageUploadState.Idle,
    val loadPhase: ComposerLoadPhase = ComposerLoadPhase.Loading,
    val save: ComposerSave = ComposerSave.Idle,
    val publish: ComposerPublish = ComposerPublish.Idle,
    val dirty: Boolean = false,
)

sealed interface ComposerLoadPhase {
    data object Loading : ComposerLoadPhase

    data object Content : ComposerLoadPhase

    data class Error(val error: ComposerError) : ComposerLoadPhase
}

sealed interface ComposerSave {
    data object Idle : ComposerSave

    data object Saving : ComposerSave

    data object Saved : ComposerSave

    data class Error(val error: ComposerError) : ComposerSave

    data class Validation(val issue: PublishIssue) : ComposerSave
}

sealed interface ComposerPublish {
    data object Idle : ComposerPublish

    data object Publishing : ComposerPublish

    data object Published : ComposerPublish

    data class Error(val error: ComposerError) : ComposerPublish

    data class Validation(val issue: PublishIssue) : ComposerPublish
}

enum class PublishIssue {
    MissingTitle,
    EmptyBody,
}

enum class ComposerError {
    Offline,
    Server,
    Unauthorized,
    MissingInstance,
    NotFound,
    TooLarge,
    UnsupportedType,
}

sealed interface ImageUploadState {
    data object Idle : ImageUploadState

    data object Uploading : ImageUploadState

    data class Error(val error: ComposerError, val retryable: Boolean) : ImageUploadState
}

enum class ComposerBlockType {
    Paragraph,
    Heading,
    Quote,
    Code,
    BulletList,
    OrderedList,
    Divider,
}

private fun ComposerUiState.composableContent(): Boolean =
    title.trim().isNotEmpty() || blocks.hasContent() || summary.trim().isNotEmpty() || tags.trim().isNotEmpty()

private fun String.toTagList(): List<String> =
    split(Regex("[,\\s]+"))
        .map { it.trim().trimStart('#').lowercase() }
        .filter { it.isNotBlank() }
        .distinct()
        .take(MAX_COMPOSER_TAGS)

private const val MAX_COMPOSER_TAGS = 5

private const val MAX_IMAGE_BYTES = 5 * 1024 * 1024

private val SUPPORTED_IMAGE_TYPES = setOf("image/png", "image/jpeg", "image/webp", "image/gif")

private fun ComposerBlockType.newBlock(id: String): ComposerBlock =
    when (this) {
        ComposerBlockType.Paragraph -> ComposerBlock.Paragraph(id = id)
        ComposerBlockType.Heading -> ComposerBlock.Heading(id = id, level = 2)
        ComposerBlockType.Quote -> ComposerBlock.Quote(id = id)
        ComposerBlockType.Code -> ComposerBlock.Code(id = id)
        ComposerBlockType.BulletList -> ComposerBlock.BulletList(id = id, items = listOf(""))
        ComposerBlockType.OrderedList -> ComposerBlock.OrderedList(id = id, items = listOf(""))
        ComposerBlockType.Divider -> ComposerBlock.Divider(id = id)
    }

private fun ComposerBlock.withText(id: String, text: String): ComposerBlock {
    if (this.id != id) return this
    return when (this) {
        is ComposerBlock.Paragraph -> copy(text = text)
        is ComposerBlock.Heading -> copy(text = text)
        is ComposerBlock.Quote -> copy(text = text)
        is ComposerBlock.Code -> copy(text = text)
        else -> this
    }
}

private fun ComposerBlock.withListItem(id: String, index: Int, text: String): ComposerBlock {
    if (this.id != id) return this
    return when (this) {
        is ComposerBlock.BulletList -> copy(items = items.updated(index, text))
        is ComposerBlock.OrderedList -> copy(items = items.updated(index, text))
        else -> this
    }
}

private fun ComposerBlock.appendingListItem(id: String): ComposerBlock {
    if (this.id != id) return this
    return when (this) {
        is ComposerBlock.BulletList -> copy(items = items + "")
        is ComposerBlock.OrderedList -> copy(items = items + "")
        else -> this
    }
}

private fun ComposerBlock.removingListItem(id: String, index: Int): ComposerBlock {
    if (this.id != id) return this
    return when (this) {
        is ComposerBlock.BulletList -> copy(items = items.filterIndexed { position, _ -> position != index })
        is ComposerBlock.OrderedList -> copy(items = items.filterIndexed { position, _ -> position != index })
        else -> this
    }
}

private fun ComposerBlock.converted(id: String, type: ComposerBlockType): ComposerBlock {
    if (this.id != id) return this
    val text =
        when (this) {
            is ComposerBlock.Paragraph -> text
            is ComposerBlock.Heading -> text
            is ComposerBlock.Quote -> text
            is ComposerBlock.Code -> text
            is ComposerBlock.BulletList -> items.firstOrNull().orEmpty()
            is ComposerBlock.OrderedList -> items.firstOrNull().orEmpty()
            is ComposerBlock.Image -> return this
            is ComposerBlock.Divider -> return this
            is ComposerBlock.RawHtml -> return this
        }
    return when (type) {
        ComposerBlockType.Paragraph -> ComposerBlock.Paragraph(id = id, text = text)
        ComposerBlockType.Heading -> ComposerBlock.Heading(id = id, level = 2, text = text)
        ComposerBlockType.Quote -> ComposerBlock.Quote(id = id, text = text)
        ComposerBlockType.Code -> ComposerBlock.Code(id = id, text = text)
        ComposerBlockType.BulletList -> ComposerBlock.BulletList(id = id, items = listOf(text))
        ComposerBlockType.OrderedList -> ComposerBlock.OrderedList(id = id, items = listOf(text))
        ComposerBlockType.Divider -> ComposerBlock.Divider(id = id)
    }
}

private fun List<String>.updated(index: Int, text: String): List<String> =
    mapIndexed { position, item -> if (position == index) text else item }

private fun Throwable.toComposerError(): ComposerError =
    when {
        this is MissingInstanceException -> ComposerError.MissingInstance
        this is UnauthorizedException -> ComposerError.Unauthorized
        this is IOException -> ComposerError.Offline
        this is ClientRequestException && response.status == HttpStatusCode.NotFound -> ComposerError.NotFound
        else -> ComposerError.Server
    }

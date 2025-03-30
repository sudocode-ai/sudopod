package template

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"

	"go.uber.org/zap"

	"github.com/e2b-dev/infra/packages/orchestrator/internal/sandbox/build"
	"github.com/e2b-dev/infra/packages/shared/pkg/storage"
	"github.com/e2b-dev/infra/packages/shared/pkg/storage/gcs"
	"github.com/e2b-dev/infra/packages/shared/pkg/storage/header"
	"github.com/e2b-dev/infra/packages/shared/pkg/utils"
)

type storageTemplate struct {
	files *storage.TemplateCacheFiles

	memfile  *utils.SetOnce[*Storage]
	rootfs   *utils.SetOnce[*Storage]
	snapfile *utils.SetOnce[File]

	memfileHeader *header.Header
	rootfsHeader  *header.Header
	localSnapfile *LocalFile

	bucket *gcs.BucketHandle
}

func newTemplateFromStorage(
	templateId,
	buildId,
	kernelVersion,
	firecrackerVersion string,
	hugePages bool,
	memfileHeader *header.Header,
	rootfsHeader *header.Header,
	bucket *gcs.BucketHandle,
	localSnapfile *LocalFile,
) (*storageTemplate, error) {
	files, err := storage.NewTemplateFiles(
		templateId,
		buildId,
		kernelVersion,
		firecrackerVersion,
		hugePages,
	).NewTemplateCacheFiles()
	if err != nil {
		return nil, fmt.Errorf("failed to create template cache files: %w", err)
	}

	return &storageTemplate{
		files:         files,
		localSnapfile: localSnapfile,
		memfileHeader: memfileHeader,
		rootfsHeader:  rootfsHeader,
		bucket:        bucket,
		memfile:       utils.NewSetOnce[*Storage](),
		rootfs:        utils.NewSetOnce[*Storage](),
		snapfile:      utils.NewSetOnce[File](),
	}, nil
}

func (t *storageTemplate) Fetch(ctx context.Context, buildStore *build.DiffStore) error {
	// Log fetch attempt
	zap.L().Info("sudocode: fetching template files",
		zap.String("template_id", t.files.TemplateId),
		zap.String("build_id", t.files.BuildId),
		zap.String("cache_dir", t.files.CacheDir()),
		zap.String("storage_snapfile_path", t.files.StorageSnapfilePath()),
		zap.String("cache_snapfile_path", t.files.CacheSnapfilePath()))

	err := os.MkdirAll(t.files.CacheDir(), os.ModePerm)
	if err != nil {
		errMsg := fmt.Errorf("failed to create directory %s: %w", t.files.CacheDir(), err)

		t.memfile.SetError(errMsg)
		t.rootfs.SetError(errMsg)
		t.snapfile.SetError(errMsg)

		return errMsg
	}

	var (
		wg   sync.WaitGroup
		errs []error
		mu   sync.Mutex
	)

	// Helper to collect errors from goroutines
	addError := func(err error) {
		mu.Lock()
		errs = append(errs, err)
		mu.Unlock()
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		if t.localSnapfile != nil {
			if err := t.snapfile.SetValue(t.localSnapfile); err != nil {
				addError(err)
			}
			return
		}

		snapfile, snapfileErr := newStorageFile(
			ctx,
			t.bucket,
			t.files.StorageSnapfilePath(),
			t.files.CacheSnapfilePath(),
		)
		if snapfileErr != nil {
			errMsg := fmt.Errorf("failed to fetch snapfile: %w", snapfileErr)
			if err := t.snapfile.SetError(errMsg); err != nil {
				addError(err)
			}
			addError(errMsg)
			return
		}

		if err := t.snapfile.SetValue(snapfile); err != nil {
			addError(err)
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()

		memfileStorage, memfileErr := NewStorage(
			ctx,
			buildStore,
			t.files.BuildId,
			build.Memfile,
			t.files.MemfilePageSize(),
			t.memfileHeader,
			t.bucket,
		)
		if memfileErr != nil {
			errMsg := fmt.Errorf("failed to create memfile storage: %w", memfileErr)
			if err := t.memfile.SetError(errMsg); err != nil {
				addError(err)
			}
			addError(errMsg)
			return
		}

		if err := t.memfile.SetValue(memfileStorage); err != nil {
			addError(err)
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()

		rootfsStorage, rootfsErr := NewStorage(
			ctx,
			buildStore,
			t.files.BuildId,
			build.Rootfs,
			t.files.RootfsBlockSize(),
			t.rootfsHeader,
			t.bucket,
		)
		if rootfsErr != nil {
			errMsg := fmt.Errorf("failed to create rootfs storage: %w", rootfsErr)
			if err := t.rootfs.SetError(errMsg); err != nil {
				addError(err)
			}
			addError(errMsg)
			return
		}

		if err := t.rootfs.SetValue(rootfsStorage); err != nil {
			addError(err)
		}
	}()

	wg.Wait()

	// Return combined errors if any occurred
	if len(errs) > 0 {
		return errors.Join(errs...)
	}
	return nil
}

func (t *storageTemplate) Close() error {
	return closeTemplate(t)
}

func (t *storageTemplate) Files() *storage.TemplateCacheFiles {
	return t.files
}

func (t *storageTemplate) Memfile() (*Storage, error) {
	return t.memfile.Wait()
}

func (t *storageTemplate) Rootfs() (*Storage, error) {
	return t.rootfs.Wait()
}

func (t *storageTemplate) Snapfile() (File, error) {
	return t.snapfile.Wait()
}

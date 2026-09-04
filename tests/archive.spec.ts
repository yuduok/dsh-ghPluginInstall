/**
 * Unit tests for the pure-filesystem branches of src/archive.ts:
 * planFlatten's single-root / multi-root / empty decisions (built with real
 * mkdir in temp dirs), materialize's rename round-trip, and detectPluginDir.
 * The download and unzip phases are NOT tested here — they need the network
 * and real unpacker subprocesses (per the task contract).
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectPluginDir, materialize, planFlatten } from '../src/archive.ts'

let work = ''

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'ghpi-archive-'))
})

afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

async function touch(path: string, content = 'x\n'): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content, 'utf8')
}

describe('planFlatten', () => {
  it('single top-level wrapper dir → flatten by moving that dir (点进去就是项目)', async () => {
    const staging = join(work, 'stage')
    const wrapper = join(staging, 'demo-main')
    await mkdir(wrapper, { recursive: true })
    await touch(join(wrapper, 'package.json'), '{"name":"demo"}\n')
    await mkdir(join(wrapper, 'src'), { recursive: true })

    const plan = await planFlatten(staging)
    expect(plan.rootToMove).toBe(wrapper)
    expect(plan.note).toContain('扁平化')
  })

  it('several top-level entries → already flat, nothing to move', async () => {
    const staging = join(work, 'stage')
    await mkdir(join(staging, 'docs'), { recursive: true })
    await touch(join(staging, 'README.md'))
    await touch(join(staging, 'a.txt'))

    const plan = await planFlatten(staging)
    expect(plan.rootToMove).toBeUndefined()
    expect(plan.note).toContain('3')
  })

  it('a single top-level file is treated as a flat archive', async () => {
    const staging = join(work, 'stage')
    await touch(join(staging, 'README.md'))

    const plan = await planFlatten(staging)
    expect(plan.rootToMove).toBeUndefined()
    expect(plan.note).toContain('README.md')
  })

  it('an empty extraction result is an error', async () => {
    const staging = join(work, 'stage')
    await mkdir(staging, { recursive: true })
    await expect(planFlatten(staging)).rejects.toThrow('解压失败：压缩包内容为空')
  })

  it('an empty wrapper dir inside the archive is an error', async () => {
    const staging = join(work, 'stage')
    await mkdir(join(staging, 'demo-main'), { recursive: true })
    await expect(planFlatten(staging)).rejects.toThrow('压缩包内的项目文件夹是空的')
  })

  it('ignores .DS_Store when deciding the layout', async () => {
    const staging = join(work, 'stage')
    await mkdir(join(staging, 'demo-main'), { recursive: true })
    await touch(join(staging, '.DS_Store'))
    await touch(join(staging, 'demo-main', 'package.json'))

    const plan = await planFlatten(staging)
    expect(plan.rootToMove).toBe(join(staging, 'demo-main'))
  })
})

describe('materialize', () => {
  it('renames the planned wrapper into place and removes the staging dir', async () => {
    const staging = join(work, 'stage')
    const wrapper = join(staging, 'demo-main')
    await mkdir(wrapper, { recursive: true })
    await touch(join(wrapper, 'package.json'), '{"name":"demo"}\n')
    const plan = await planFlatten(staging)
    expect(plan.rootToMove).toBe(wrapper)

    const finalDir = join(work, 'plugin')
    await materialize(plan, staging, finalDir)

    expect(existsSync(join(finalDir, 'package.json'))).toBe(true)
    expect(existsSync(staging)).toBe(false)
  })

  it('renames the staging dir itself for flat archives', async () => {
    const staging = join(work, 'stage')
    await touch(join(staging, 'a.txt'))
    await mkdir(join(staging, 'b'), { recursive: true })
    await touch(join(staging, 'b', 'c.txt'))
    const plan = await planFlatten(staging)
    expect(plan.rootToMove).toBeUndefined()

    const finalDir = join(work, 'plugin')
    await materialize(plan, staging, finalDir)

    expect(existsSync(join(finalDir, 'a.txt'))).toBe(true)
    expect(existsSync(join(finalDir, 'b', 'c.txt'))).toBe(true)
    expect(existsSync(staging)).toBe(false)
  })
})

describe('detectPluginDir', () => {
  it('returns the package name for an installable dir', async () => {
    const dir = join(work, 'demo')
    await mkdir(dir, { recursive: true })
    await touch(join(dir, 'package.json'), '{"name":"dsh-demo","version":"0.1.0"}\n')
    expect(await detectPluginDir(dir)).toBe('dsh-demo')
  })

  it('returns undefined for non-plugin dirs and malformed manifests', async () => {
    const dir = join(work, 'plain')
    await mkdir(dir, { recursive: true })
    expect(await detectPluginDir(dir)).toBeUndefined()

    await touch(join(dir, 'package.json'), '{ not json')
    expect(await detectPluginDir(dir)).toBeUndefined()

    const unnamed = join(work, 'unnamed')
    await mkdir(unnamed, { recursive: true })
    await touch(join(unnamed, 'package.json'), '{"version":"0.1.0"}\n')
    expect(await detectPluginDir(unnamed)).toBeUndefined()
  })
})

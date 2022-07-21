/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as React from 'react';

import {LexicalAutoEmbedPlugin} from './LexicalAutoEmbedPlugin';
import {TwitterEmbedConfig} from './TwitterPlugin';
import {YoutubeEmbedConfig} from './YouTubePlugin';

export default function AutoEmbedPlugin(): JSX.Element {
  return (
    <LexicalAutoEmbedPlugin
      embedConfigs={[TwitterEmbedConfig, YoutubeEmbedConfig]}
    />
  );
}

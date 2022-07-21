/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {$createCodeNode} from '@lexical/code';
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {INSERT_HORIZONTAL_RULE_COMMAND} from '@lexical/react/LexicalHorizontalRuleNode';
import {
  LexicalNodeMenuPlugin,
  LexicalTypeaheadMenuPlugin,
  QueryMatch,
  TypeaheadOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/src/LexicalTypeaheadMenuPlugin';
import {$createHeadingNode, $createQuoteNode} from '@lexical/rich-text';
import {$wrapLeafNodesInElements} from '@lexical/selection';
import {INSERT_TABLE_COMMAND} from '@lexical/table';
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  FORMAT_ELEMENT_COMMAND,
  LexicalCommand,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  RangeSelection,
  TextNode,
} from 'lexical';
import {useCallback, useEffect, useMemo, useState} from 'react';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import useModal from '../hooks/useModal';
import catTypingGif from '../images/cat-typing.gif';
import {INSERT_EXCALIDRAW_COMMAND} from './ExcalidrawPlugin';
import {INSERT_IMAGE_COMMAND} from './ImagesPlugin';
import {
  InsertEquationDialog,
  InsertImageDialog,
  InsertPollDialog,
  InsertTableDialog,
  InsertTweetDialog,
} from './ToolbarPlugin';
import TextInput from '../ui/TextInput';
import Button from '../ui/Button';
import {$createTweetNode} from '../nodes/TweetNode';
import {$findMatchingParent} from '@lexical/utils';
import {$isLinkNode, AutoLinkNode, LinkNode} from '@lexical/link';
import {AUTO_LINK_COMMAND} from '@lexical/react/LexicalAutoLinkPlugin';

export type EmbedMatchResult = {
  url: string;
  id: string;
};

export type EmbedConfig = {
  // e.g. Tweet or Google Map.
  contentName: string;

  // Icon for display.
  icon?: JSX.Element;

  // An example of a matching url https://twitter.com/jack/status/20
  exampleUrl: string;

  // For extra searching.
  keywords: Array<string>;

  // Embed a Figma Project.
  description?: string;

  // Determine if a given URL is a match and return url data.
  parseUrl: (text: string) => EmbedMatchResult | null;

  // Create the Lexical embed node from the url data.
  insertNode: (editor: LexicalEditor, result: EmbedMatchResult) => void;
};

const URL_MATCHER =
  /((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;

function checkForLinkMatch(
  text: string,
  editor: LexicalEditor,
  minMatchLength: number,
): QueryMatch | null {
  let match = URL_MATCHER.exec(text);

  if (match !== null) {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const node = $findMatchingParent(selection.anchor.getNode(), (n) =>
          $isLinkNode(n),
        );

        const fullMatch = node ? URL_MATCHER.exec(node.getTextContent()) : null;

        match = fullMatch != null ? fullMatch : match;
      }
    });
    debugger;

    return {
      leadOffset: match[0].length,
      matchingString: match[0],
      replaceableString: match[0],
    };
  }

  return null;
}

class AutoEmbedOption extends TypeaheadOption {
  // What shows up in the editor
  title: string;
  // Icon for display
  icon?: JSX.Element;
  // For extra searching.
  keywords: Array<string>;
  // TBD
  keyboardShortcut?: string;
  // What happens when you select this option?
  onSelect: (queryString: string) => void;

  constructor(
    title: string,
    options: {
      icon?: JSX.Element;
      keywords?: Array<string>;
      keyboardShortcut?: string;
      onSelect: (queryString: string) => void;
    },
  ) {
    super(title);
    this.title = title;
    this.keywords = options.keywords || [];
    this.icon = options.icon;
    this.keyboardShortcut = options.keyboardShortcut;
    this.onSelect = options.onSelect.bind(this);
  }
}

function AutoEmbedMenuItem({
  index,
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: {
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  option: AutoEmbedOption;
}) {
  let className = 'item';
  if (isSelected) {
    className += ' selected';
  }
  return (
    <li
      key={option.key}
      tabIndex={-1}
      className={className}
      ref={option.setRefElement}
      role="option"
      aria-selected={isSelected}
      id={'typeahead-item-' + index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}>
      {option.icon}
      <span className="text">{option.title}</span>
    </li>
  );
}

export function AutoEmbedDialog({
  embedConfig,
  onClose,
}: {
  embedConfig: EmbedConfig;
  onClose: () => void;
}): JSX.Element {
  const [text, setText] = useState('');
  const [editor] = useLexicalComposerContext();

  const urlMatch = URL_MATCHER.exec(text);
  const embedResult =
    text != null && urlMatch != null ? embedConfig.parseUrl(text) : null;

  const onClick = () => {
    if (embedResult != null) {
      embedConfig.insertNode(editor, embedResult);
      onClose();
    }
  };

  return (
    <>
      <TextInput
        label={`Embed ${embedConfig.contentName}`}
        placeholder={embedConfig.exampleUrl}
        onChange={setText}
        value={text}
      />
      <div className="ToolbarPlugin__dialogActions">
        <Button disabled={!embedResult} onClick={onClick}>
          Confirm
        </Button>
      </div>
    </>
  );
}

export const INSERT_EMBED_COMMAND: LexicalCommand<EmbedConfig> =
  createCommand();

export function LexicalAutoEmbedPlugin({
  embedConfigs,
}: {
  embedConfigs: Array<EmbedConfig>;
}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [modal, showModal] = useModal();

  const [nodeKey, setNodeKey] = useState<NodeKey | null>(null);
  const [activeEmbedConfig, setActiveEmbedConfig] =
    useState<EmbedConfig | null>(null);

  useEffect(() => {
    return editor.registerMutationListener(AutoLinkNode, (nodeMutations) => {
      for (const [key, mutation] of nodeMutations) {
        if (mutation === 'created') {
          editor.getEditorState().read(() => {
            const linkNode = $getNodeByKey(key);

            if ($isLinkNode(linkNode)) {
              const embedConfigMatch = embedConfigs.find((embedConfig) =>
                embedConfig.parseUrl(linkNode.__url),
              );
              if (embedConfigMatch != null) {
                setActiveEmbedConfig(embedConfigMatch);
                setNodeKey(linkNode.getKey());
              }
            }
          });
        } else {
          if (key === nodeKey) {
            setNodeKey(null);
          }
        }
      }
    });
  }, [editor, embedConfigs, nodeKey]);

  useEffect(() => {
    return editor.registerCommand<EmbedConfig>(
      INSERT_EMBED_COMMAND,
      (embedConfig: EmbedConfig) => {
        showModal(`Embed ${embedConfig.contentName}`, (onClose) => (
          <AutoEmbedDialog embedConfig={embedConfig} onClose={onClose} />
        ));

        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor, showModal]);

  const options = useMemo(() => {
    return activeEmbedConfig != null && nodeKey != null
      ? [
          new AutoEmbedOption(`Embed ${activeEmbedConfig.contentName}`, {
            icon: activeEmbedConfig.icon,
            keywords: activeEmbedConfig.keywords,
            onSelect: () => {
              editor.update(() => {
                const linkNode = $getNodeByKey(nodeKey);

                if ($isLinkNode(linkNode)) {
                  const result = activeEmbedConfig.parseUrl(linkNode.__url);
                  if (result != null) {
                    activeEmbedConfig.insertNode(editor, result);
                  }
                  linkNode.remove();
                }
              });
            },
          }),
          new AutoEmbedOption('Close', {
            onSelect: () => {
              setNodeKey(null);
              setActiveEmbedConfig(null);
            },
          }),
        ]
      : [];
  }, [activeEmbedConfig, editor, nodeKey]);

  const onSelectOption = useCallback(
    (
      selectedOption: AutoEmbedOption,
      _nodeToRemove: TextNode | null,
      closeMenu: () => void,
      matchingString: string,
    ) => {
      editor.update(() => {
        selectedOption.onSelect(matchingString);
        closeMenu();
      });
    },
    [editor],
  );

  return (
    <>
      {modal}
      <LexicalNodeMenuPlugin<AutoEmbedOption>
        nodeKey={nodeKey}
        onClose={() => {
          setNodeKey(null);
          setActiveEmbedConfig(null);
        }}
        onSelectOption={onSelectOption}
        options={options}
        menuRenderFn={(
          anchorElement,
          {selectedIndex, selectOptionAndCleanUp, setHighlightedIndex},
        ) =>
          anchorElement && nodeKey != null
            ? ReactDOM.createPortal(
                <ul>
                  {options.map((option, i: number) => (
                    <AutoEmbedMenuItem
                      index={i}
                      isSelected={selectedIndex === i}
                      onClick={() => {
                        setHighlightedIndex(i);
                        selectOptionAndCleanUp(option);
                      }}
                      onMouseEnter={() => {
                        setHighlightedIndex(i);
                      }}
                      key={option.key}
                      option={option}
                    />
                  ))}
                </ul>,
                anchorElement,
              )
            : null
        }
      />
    </>
  );
}

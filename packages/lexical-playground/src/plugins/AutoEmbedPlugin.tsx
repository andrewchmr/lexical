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
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  FORMAT_ELEMENT_COMMAND,
  LexicalCommand,
  LexicalEditor,
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
import {$insertBlockNode} from '@lexical/utils';

type EmbedMatchResult = {
  url: string;
  id: string;
};

type EmbedConfig = {
  // e.g. Tweet or Google Map.
  contentName: string;

  // Icon for display.
  icon?: JSX.Element;

  // An example of a matching url https://twitter.com/jack/status/20
  exampleUrl: string;

  // For extra searching.
  keywords: Array<string>;

  // Embed a Figma Project.
  description: string;

  // Determine if a given URL is a match and return url data.
  parseUrl: (text: string) => EmbedMatchResult;

  // Create the Lexical embed node from the url data.
  generateNode: (editor: LexicalEditor, result: EmbedMatchResult) => void;
};

export const TwitterEmbedConfig: EmbedConfig = {
  // e.g. Tweet or Google Map.
  contentName: 'Tweet',

  // nodeType:

  exampleUrl: 'https://twitter.com/jack/status/20',

  // Icon for display.
  icon: <i className="icon tweet" />,

  // For extra searching.
  keywords: ['tweet', 'twitter'],

  // Create the Lexical embed node from the url data.
  generateNode: (editor: LexicalEditor, result: EmbedMatchResult) => {
    editor.update(() => {
      debugger;
      const tweetNode = $createTweetNode(result.id);
      $insertBlockNode(tweetNode);
    });
  },

  // Determine if a given URL is a match and return url data.
  parseUrl: (text: string) => {
    const match = checkForTwitterMatch(text);

    if (match != null) {
      debugger;
      return {
        id: match[4],
        url: match[0],
      };
    }
  },
};

const URL_MATCHER =
  /((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;

const checkForTwitterMatch = (text) =>
  /^https:\/\/twitter\.com\/(#!\/)?(\w+)\/status(es)*\/(\d+)$/.exec(text);

function checkForLinkMatch(
  text: string,
  selection: RangeSelection,
  minMatchLength: number,
): QueryMatch | null {
  let match = URL_MATCHER.exec(text);

  if (selection.isCollapsed()) {
    debugger;
    // Get full link from the parent node
    match = URL_MATCHER.exec(selection.anchor.getNode().getTextContent());
  }

  if (match !== null) {
    return {
      leadOffset: match[0].length,
      matchingString: match[0],
      replaceableString: match[0],
    };
  }

  return null;
}

function checkForPossibleEmbedMatch(
  text: string,
  selection: RangeSelection,
): QueryMatch | null {
  const match = checkForLinkMatch(text, selection, 1);
  return match;
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
      embedConfig.generateNode(editor, embedResult);
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

export default function AutoEmbedPlugin(): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [modal, showModal] = useModal();
  const [queryString, setQueryString] = useState<string | null>(null);

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('/', {
    minLength: 0,
  });

  useEffect(() => {
    return editor.registerCommand<EmbedConfig>(
      INSERT_EMBED_COMMAND,
      (embedConfig: EmbedConfig) => {
        showModal(`Embed ${embedConfig.contentName}`, (onClose) => (
          <AutoEmbedDialog embedConfig={embedConfig} onClose={onClose} />
        ));
        debugger;

        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor, showModal]);

  const options = useMemo(() => {
    return [
      new AutoEmbedOption('Embed Link', {
        icon: <i className="icon link" />,
        keywords: ['embed', 'link', 'url'],
        onSelect: () => console.log('embed'),
      }),
    ];
  }, []);

  const onSelectOption = useCallback(
    (
      selectedOption: AutoEmbedOption,
      nodeToRemove: TextNode | null,
      closeMenu: () => void,
      matchingString: string,
    ) => {
      editor.update(() => {
        if (nodeToRemove) {
          nodeToRemove.remove();
        }
        selectedOption.onSelect(matchingString);
        closeMenu();
      });
    },
    [editor],
  );

  return (
    <>
      {modal}
      <LexicalTypeaheadMenuPlugin<AutoEmbedOption>
        onQueryChange={setQueryString}
        onSelectOption={onSelectOption}
        triggerFn={checkForPossibleEmbedMatch}
        options={options}
        menuRenderFn={(
          anchorElement,
          {selectedIndex, selectOptionAndCleanUp, setHighlightedIndex},
        ) =>
          anchorElement && options.length
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
